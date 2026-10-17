# Migration cutover and acceptance

Part of the [TanStack Start and Cloudflare specification](README.md). This is the reusable cutover runbook. The
[acceptance record](acceptance.md) identifies operations actually completed and their evidence; this page alone does
not authorize a production change.

Use the task IDs in [delivery.md](delivery.md) and evidence gates in [verification.md](verification.md). M6 is deliberately
split into storage/static, web and job-family transitions. The Start web release may proceed with the existing Node
worker, after shared schema/storage compatibility is verified. Only the new executor's own acceptance permits a job
ownership transfer.

## Establish the baseline

Inventory live web, worker, Storybook, Postgres, buckets, scheduled backups, AWS queues, provider callbacks, DNS, cache
rules and secrets by name/scope without exporting secret values into documentation. Record deployed revisions and
reconcile differences with the repository inventory. Measure DB major version/extensions/size, largest tables and
JSON values, object counts/bytes/checksums, job duration, event backlog, provider throttling and file-processing memory.

Agree on allowable write downtime and recovery point/time targets for the compute and storage cutovers. Rehearse with
authorized nonproduction data. Keep local Docker and isolated CI databases populated through migrations and fixtures;
do not enable workers against a raw production clone. The separately merged Neon migration owns data transfer and
PR database provisioning; this web cutover must verify and use the resulting authoritative database.

## Neon Postgres connectivity and continuity

1. Confirm the authoritative staging and production Neon branches and completion of the separately managed
   [database transfer](../../neon.md#transfer-and-acceptance). Preserve migration history, data and encryption keys.
   The earlier Cloudflare qualification targeted Railway; it does not qualify the Neon origin.
2. Prove the deployed Worker connection through Hyperdrive to Neon's direct endpoint, starting with staging.
   Require certificate and hostname verification, and test failed validation. Never turn verification off or reuse
   the Railway CA for Neon. Keep credentials in scoped secrets, not browser code or logs.
   [Hyperdrive TLS configuration](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/).
3. Use separate environment-specific Hyperdrive configurations with query caching disabled initially. Validate row
   locks, transactions, JSON/array queries, token refresh serialization, reconnect behavior and read-after-write results.
   Use invocation-scoped clients and reserve enough origin connections for retained Node services and the migration
   runner. Measure cross-provider latency and network egress under representative load before switching web traffic.
4. Configure retained Node services with pooled Neon connections. Move the migration runner from the web
   service's predeploy hook to one serialized CI job before retiring that web service; never run both migration paths
   for the same release. Its direct Neon connection must use `sslmode=verify-full` and hold the migration advisory
   lock on one session; a transaction pooler is rejected.
5. Confirm Neon's actual history retention and restore into an isolated nonproduction database. Verify key business
   totals and matching R2 documents. Neon does not inherit Railway's old daily/weekly backup retention.
6. Code/origin rollback continues to use the same authoritative Neon database. Preserve expand/contract schema
   compatibility for old and new web/job executors. Returning to a stale Railway copy loses accepted writes;
   data recovery requires the separate database runbook. Maintain one execution owner per job family.

Use the repository's migration process for all schema changes, including any later outbox/executor fields. Do not edit
historical migrations or use hand-applied schema SQL. The [database operations guide](../../neon.md) owns data-transfer,
branching and recovery requirements.

## Private bucket cutover

1. Create private R2 buckets per environment and scoped credentials for the still-Node services. The current S3 wrapper
   uses basic put/get/delete operations; verify these against R2 before switching its endpoint. R2 supports an
   [S3-compatible API](https://developers.cloudflare.com/r2/api/s3/api/).
2. Copy objects preserving keys, bytes and content types. Build a count/size/checksum manifest and verify every referenced
   object exists. Do not assume S3 ETags are universal content hashes, particularly for multipart objects.
3. Briefly pause all document writers, including worker-generated files; copy the final delta and account for deletions.
   Switch both services together. Test old and new documents, all workspace roles, outdated versions, withdrawn labels,
   unauthorized access, and import files. Keep database object keys unchanged.
4. Retain the old bucket through the observation window. After new writes/deletes in R2, a rollback requires a reverse
   delta and deletion reconciliation; an endpoint reversal alone is insufficient. Later Workers can use native R2
   bindings behind the same storage contract. Private documents never inherit the public media bucket's access policy.

Define a separate document backup/retention policy before retiring the old bucket. Database restore history does not
restore deleted or overwritten R2 objects. Keep immutable document keys where possible, retain referenced versions
through the database recovery window, and prove that a restored database can retrieve the corresponding files.

## Framework and web cutover

Prove a complete route before committing to the port: login, workspace authorization, server data, localized rendering,
mutation, origin/CSRF validation, fresh data after mutation, private document download and logout. Exercise on deployed
Workers with actual nonproduction WorkOS credentials, Neon staging Postgres and isolated R2 resources. Serialize
staging acceptance runs or provision separate nonproduction databases for concurrent writable previews.

Port the remaining routes in reviewable groups, preserving the HTTP API and URL contracts. Cover custom authentication,
all workspace roles, invitations, provider OAuth callbacks, integration challenge/signature checks, redirects,
maintenance behavior, marketing SEO, fonts, RTL and browser-only dependencies. A preview URL may require explicit
provider registration; do not promise arbitrary preview domains can connect merchant accounts.

Replace Railway's web `predeploy` migration with one serialized CI migration job. Build and promote the tested release,
and do not let every Worker instance migrate on startup. Preserve expand/contract schema compatibility while old code,
jobs or Workflows can still run. Staging seeds must never execute in production.

Switch web routing while the Node worker continues against Neon Postgres and R2. Keep `copacker.ai`, `staging.copacker.ai`, media and
provider callback paths stable. Verify TLS and proxy behavior rather than copying the Railway-specific SSL setting.
Retain a tested origin/version rollback and compatible cookies; if Start's session format differs, explicitly plan
re-authentication. Bypass shared CDN caching for auth/session responses and tenant data.

## Worker and event cutover

The current web release retains the Node executor and adds native Queue wake signals plus the Cron scheduler from
PR 17. First qualify publication after commit, delayed retries, restart, hourly recovery and daily reconciliation as
described in [background jobs](../../background-jobs.md). The following executor-transfer requirements remain future work.

1. Add inbox/outbox and execution ownership through migrations. Commit business changes and jobs together. The
   dispatcher retries unconfirmed publication; consumers tolerate duplicate delivery and out-of-order messages.
2. Migrate one job family at a time. Use explicit ownership or routing so the old poller and new consumer cannot execute
   the same job. Drain or checkpoint existing running attempts, preserve delayed jobs and failed-job/manual-retry state,
   and fence attempts whose leases expired. Keep the DB job ledger for user-visible progress and audit.
3. Separate quick side effects from long pagination, report polling and document processing. Use durable Workflow
   checkpoints, provider idempotency keys where available, and reconciliation for ambiguous creates. Never retry an
   uncertain shipment creation blindly. Persist large artifacts in R2 and retain their keys in job state.
   Acquire and close database clients within an execution step; do not hold a connection or transaction across a
   durable sleep or checkpoint boundary.
4. Cut over SQS consumption from the Node reader to the chosen bridge with a controlled pause. Preserve message IDs and
   deduplication history. With Lambda, report partial-batch failures and acknowledge only after ingress has committed
   the event; configure visibility/retry/DLQ settings for the bridge's worst-case processing time.
5. Move reconciliation to Cron with the existing daily identity/time semantics. Reproduce rate-limit backoff and
   event coalescing. Stop old schedulers only once ownership has transferred. Add a periodic outbox sweep so an
   interrupted wakeup cannot strand committed work.
6. Preserve workflow-version compatibility for in-flight instances. Rehearse rollback with new queued payloads and
   already executed side effects; rolling code back does not undo emails, commerce writes or database changes.

## Completion gates

Before each transition, prepare a release record naming the tested commit/artifact, current and target resources,
schema compatibility, migration runner, exact pause/switch sequence, observer, rollback owner and observation window.
Include measured recovery targets and latency/error/queue-age thresholds; replace planning placeholders before the
release decision. Use scoped `cf` configuration/commands verified against the pinned CLI, not guessed production
commands. A successful deployment alone is not the routing-switch gate.

| Transition | Immediate checks | Rollback constraints |
| --- | --- | --- |
| Private R2 | Manifest, old/new private downloads, upload and worker-generated file, access/revision denial | Pause writers and reconcile reverse delta/deletions after any new R2 writes |
| Static Storybook | Domain/TLS, assets, MSW, navigation and story access policy | Restore previous routing/artifact; retain the previous deployment through observation |
| Start web | Health commit, custom sign-in/out, mutation/freshness, private download, callback, locale and maintenance status | Restore compatible origin/code; keep the authoritative Neon DB and accepted cookie transition; do not roll back schema destructively |
| Job family | Correct owner/fence, queued/delayed jobs, progress, provider outcome and DLQ/outbox age | Pause new claims, drain/checkpoint, reconcile external effects, then transfer owner; never enable two executors |
| SQS reader/scheduler | Durable receipt, partial-batch retries, event age and one daily job identity | Controlled reader/trigger handover; preserve accepted event/job identities and deduplication history |

Stop the affected transition for authorization leakage, missing documents, lost durable work, invalid TLS, uncontrolled
duplicate effects or unresolved performance/recovery budget breaches. Keep accepted work durable while paused. Record
the incident and choose the rehearsed rollback or a concrete repair; do not continue subsequent cutovers automatically.

| Gate | Evidence required |
| --- | --- |
| Repository | `pnpm verify` clean; migration checks; updated stories and browser tests for affected surfaces |
| User journeys | Integrated-browser acceptance at desktop/mobile with keyboard/accessibility checks; buyer, supplier and forwarder permissions; localization and sign-in parity |
| Workers runtime | Real deployment exercises transactions, SDKs, cryptography, PDF/ZIP/XLSX processing and worst-case concurrent memory/CPU; no Node-only assumption left untested |
| Events and jobs | Duplicate/out-of-order replay, provider timeout, process death after side effect, expired lease, queue/DLQ recovery, outbox publication failure and manual retry |
| Database continuity | Confirm authoritative Neon branches; verified Hyperdrive TLS, transaction correctness, shared connection budget, acceptable latency and a proven recovery window |
| Data and files | Reconciled business totals/object manifests; token decryption and refresh; zero missing referenced documents; no cross-workspace disclosure |
| Environment isolation | No production tokens, writes, subscriptions or email in test environments; independent DB/storage/queue bindings and cleanup for any optional previews |
| Operations | Health reports correct commit; useful alerts; restored DB plus matching documents; documented code and data rollback; measured cost/latency acceptable |

Retire only the replaced Railway web, worker, Storybook and private bucket resources after the agreed observation window,
restore drill, reconciliation and replacement of any necessary container workload. Database retirement belongs to
the separate Neon migration checklist; never delete a recovery copy during a web deployment. Remove only obsolete
secrets, aliases and provider registrations, then update the live operations and domain documentation.
Neon hosting and required AWS notification transport remain part of the resulting platform.
