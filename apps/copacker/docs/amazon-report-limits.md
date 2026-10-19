# Amazon report request limits

## Investigation, October 19, 2026

The latest removal-order and removal-shipment attempts ended at 23:49 UTC October 18 and 00:04 UTC October 19 with
HTTP 429 during `createReport`, even after five- and ten-minute waits. Five order rows and four shipment rows survive.
Aged storage was likewise rejected at 23:33 UTC. These failures precede document parsing; they do not establish empty
periods. September aged storage still has seven imported rows. Reimbursements refreshed successfully at 23:15 UTC,
retaining 102 rows. Historical seller-fulfilled returns have 47 rows, and AWD has 12 shipment snapshots.

Earlier monthly report completions were approximately 32 seconds apart. Clients paced reads locally but did not
coordinate first creation attempts across report families, jobs or workspaces. Increasing retry delays alone did not
address that request pattern. Persistent rejection after long waits also means short-term pacing is not a proven sole
cause. The previous implementation did not retain successful creation rate headers, so the account's effective quota
cannot be reconstructed from those logs.

## What Amazon publishes

- The [createReport reference](https://developer-docs.amazon/sp-api/lang-en_us/reference/createreport) lists a default
  rate of 0.0167 requests/second and a burst of 15. This describes an operation-level allowance, not all possible limits.
- [Usage-plan guidance](https://developer-docs.amazon/sp-api/docs/usage-plans-and-rate-limits) describes account/application
  scopes and additional constraints. The rate header can be absent and does not describe every applicable limit.
- The [FBA catalog](https://developer-docs.amazon/sp-api/docs/report-type-values-fba) distinguishes content-generation
  frequency (30 minutes for near-real-time reports, four hours for daily reports) from request allowances. It explicitly
  limits fulfilled-shipment reports to 12 requests per seller in eight hours, including Seller Central requests. Our
  existing fulfillment budget reserves only ten. The catalog does not publish that same cap for aged storage or removals.
- An [SP-API team clarification](https://github.com/amzn/selling-partner-api-models/discussions/5212) gives three requests
  per five minutes for the reported Sales and Traffic issue. Its scope across other report types is unresolved. Do not
  present it as a confirmed universal FBA limit, or infer an undocumented hourly/daily cap from HTTP 429 alone.

## Application policy

`amazonFor` installs a database-backed creation policy. A hashed NA-region/application/seller key coordinates all
workspaces and worker instances using that account. This is operational quota state, not accounting evidence.

- Space new report creations by at least two minutes. This is our conservative baseline, not an Amazon guarantee.
  Slower advertised rates increase the stored interval. Successful higher rates do not remove the baseline.
- Reserve an available slot atomically immediately before creation. Wait outside transactions, recheck after waiting,
  and honor the caller deadline and ownership checks. Do not reserve a queue of future slots.
- On HTTP 429, persist a five-minute account pause and a report-type cooldown of one hour, then two, four and eight
  hours for repeated rejection. Longer Retry-After wins. A successful creation resets that type's escalation.
  These cooldowns are an operational response to observed persistent throttling, not a claim about Amazon's reset time.
- A managed creation makes one attempt, then lets the durable cooldown govern subsequent jobs. Manual clicks, process
  restarts and new date ranges cannot bypass it. Existing reports can still be listed, polled, downloaded and validated.
- If waiting cannot fit the caller deadline, defer locally without sending a request. Existing ingestion status uses
  `report_throttled`; diagnostics distinguish `locallyDeferred` and `retryAt` from actual HTTP responses. Prior evidence
  remains intact. Normal subsequent syncs retry eligible gaps; this does not add a new scheduler or UX.

Each creation response emits `amazon_report_request` with a hashed scope, timestamp, fixed-format report type, HTTP
status, numeric rate/Retry-After and a restricted-format provider request ID. No credentials, URLs, bodies, seller IDs
or financial rows are logged. Use these events to compare actual spacing and response limits, and to assemble a support
case if rejection persists at low volume. Do not repeatedly trigger full syncs to probe the limit.

Migration `0062_shocking_the_twelve` only adds quota state; existing migrations and financial data are unchanged.
The new policy requires deployment and live acceptance before claiming aged-storage or removal recovery.
