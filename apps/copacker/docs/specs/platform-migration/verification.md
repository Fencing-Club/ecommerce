# Verification and release criteria

Part of the [migration specification](README.md). This is the acceptance contract for implementation. No test or
production readiness result is claimed by writing this plan. Record results against a commit, environment and deployed
configuration, with links to CI output and browser/runtime evidence. Reconcile the route baseline before each release.

## Acceptance matrix

| ID | Area | Required evidence and pass condition |
| --- | --- | --- |
| V01 | Repository/build | `pnpm verify` clean; production app and static Storybook build; fresh-checkout route/binding generation; no Next imports/dependencies/configuration left in Copacker or required only for Copacker by a shared package |
| V02 | Routing/API | All 40 page paths and 62 handler files mapped, all exported methods preserved, applicable action-dispatch contracts covered; correct redirects, 403/404/503, method errors, binary headers and provider callback paths |
| V03 | Authentication | Custom password/signup/verification/reset/invite/social/organization flows work; callback replay/expiry rejected; session refresh/revocation/logout and cookie/origin behavior match the accepted transition plan |
| V04 | Authorization/isolation | Buyer, supplier and forwarder access matches existing rules; cross-workspace IDs and direct server-function calls denied; restricted prices absent from HTML/loader/API payloads; workspace switch and sign-out clear stale tenant data |
| V05 | Input and secret boundaries | CSRF/origin and webhook signatures exercised; safe redirects; server import violations fail development/build; client bundle contains no secrets/server implementation; errors/logs do not expose credentials or document bodies |
| V06 | UI, stories and accessibility | Every migrated page/component retains sibling stories/play tests; complete critical journeys in the integrated browser at desktop/mobile; keyboard navigation, focus, accessible names and error/pending states verified |
| V07 | Localization/hydration | All nine locales and ICU validation pass; profile/header/fallback precedence, time zone, localized errors/email and titles preserved; Urdu direction/line height/fonts correct; no hydration errors or cross-request locale leakage |
| V08 | Query strings and freshness | Both nuqs consumers pass SSR/direct-link/history/search-preservation tests or the recorded fallback does; every former refresh call has tested invalidation; RTK Query, Router and server-cache state stays scoped and fresh |
| V09 | Files/runtime | Existing maximum file/page sizes, representative worst-case PDFs/ZIPs/XLSX and generated documents pass on their selected executor under concurrency; streaming/validation/privacy preserved; no missing referenced objects |
| V10 | Database continuity | Deployed Hyperdrive TLS/CA verification and failure cases pass; transactions/locks/read-after-write/token refresh correct; clients released; measured connection budget holds while Node and Workers coexist; Railway backups retained |
| V11 | Queue/ledger correctness | Duplicate/out-of-order messages, interrupted publication, expired claims, cancellation and delayed jobs recover without lost committed work or stale final writes; terminal/manual-retry states remain visible |
| V12 | Workflow/provider recovery | Every job kind passes relevant restart/step/retry drills; provider creates are deduplicated or explicitly reconciled; no blind retry after an ambiguous external create; compatible in-flight deployment and rollback demonstrated |
| V13 | Ingress/scheduling | SQS partial batches, duplicate events, invalid bridge authentication and DB outage behave correctly; ack occurs after durable inbox commit; one reader/owner per transition; daily reconciliation and missed-wakeup recovery proven |
| V14 | Environments and delivery | Local/CI/staging/production binding isolation, callback allowlists and scoped secrets validated; previews cannot write to production; production promotes the tested commit/artifact; migrations have one runner and health reports the release |
| V15 | Performance/observability/cost | Recorded budgets met under representative load; logs/traces correlate requests and jobs without secrets; alerts and pause/recovery procedures exercised; cost includes retained DB, AWS transport and any processor |
| V16 | Cutover/recovery | Rehearsed origin/code rollback, document reverse delta, job ownership transfer and isolated DB restore with matching objects meet agreed recovery targets; resource retirement waits for observation and reconciliation |

V01–V10 and V14–V16 apply to the web release. V11–V13 are required before replacing the corresponding background
executor or ingress path. R2 and static-hosting transitions require their applicable file, isolation and recovery gates
even if the full web port is not yet ready. An untouched Node executor is tested for continued compatibility with shared
schema, storage and credentials; it is not falsely reported as a completed Cloudflare job migration.

## Test layers and commands

Keep the repository's existing tools and coverage discipline. Adapt tests to the real new boundaries rather than
replacing assertions with implementation-shaped mocks. Existing unit and story tests are useful but do not prove the
deployed Workers runtime or complete a UX change by themselves.

| Layer | Coverage |
| --- | --- |
| Unit/domain | Existing business rules, permissions, validation, localization, encryption/signatures, job transitions and side-effect identity |
| Database integration | Real PostgreSQL migrations, locks, concurrent claims, unique inbox/outbox constraints, token refresh, transaction rollback and connection cleanup |
| Workers integration | Real workerd request/binding behavior, server-only boundaries, cookies/streaming, R2/queue contracts and compatible SDK imports; use an agreed compatible test integration |
| Stories | Presentational routes/components with memory Router, locale/permission fixtures and MSW; meaningful play tests for interaction and errors |
| Browser E2E | Production Workers build, all role-critical journeys, direct links/history, mutations, downloads, maintenance and external-provider test doubles |
| Deployed staging | Actual WorkOS nonproduction sessions, Hyperdrive/CA, private R2, selected provider sandbox/authorized test integrations, CPU/memory and recovery behavior |

At completion of a coherent implementation change, run focused checks appropriate to that change, then `pnpm verify`.
Use `pnpm --filter copacker build`, `pnpm --filter copacker build-storybook` and
`pnpm --filter copacker test:e2e` for the corresponding runtime/build checks once their implementations are migrated.
Do not assume `pnpm verify` includes production builds or all browser acceptance. Preserve hooks and TypeScript 7;
do not bypass failed checks or exclude new routes to make coverage pass.

Keep E2E builds and local runtime state separate from interactive development. An explicit E2E target is tested as that
target; do not silently reuse a different running server. Local and CI tests use disposable fixtures, not production
databases or copied live provider tokens. Test doubles may model failures; deployed runtime proof must still exercise
the real integration boundaries that mocks cannot establish.

## Critical user journeys

Record the baseline result and the Start result for each journey, including relevant network/status output. Exercise
desktop and mobile layouts, keyboard-only operation, dialogs/sheets, loading/error states and screen-reader names.

1. Signed-out visitor views localized marketing, follows navigation, submits contact/waitlist forms and unsubscribes;
   private pages remain protected and metadata/canonical output is correct.
2. New and existing users complete signup/verification/login/reset/invitation and organization/workspace selection;
   invalid/expired tokens and unsafe return paths fail safely; logout revokes local access.
3. Buyer, supplier and forwarder each enter permitted pages; role restrictions, price visibility and direct-object-ID
   attempts are checked server-side. Switch workspaces in two tabs and verify no stale data or flash of another tenant.
4. Open partner sheets and product import from query-string links, refresh them, close them, and navigate history while
   retaining unrelated filters. Invalid enum/boolean values have the agreed parsing behavior.
5. Create/edit products and catalogs; import/export supported spreadsheets; update inventory fields, filter/restock,
   request sync and observe fresh data without a manual full reload.
6. Create/revise an order, accept/respond to proposals, move through relevant shipment steps, and observe job progress.
   Download old/current labels, PO and packet; withdrawn or unauthorized documents remain unavailable.
7. Upload/process a valid document and reject invalid/oversized/active-content files; recover from processing failure
   without losing progress or exposing unvalidated files. Exercise cancellation and a supported large input.
8. Connect/reconnect/disconnect merchant integrations in an authorized test environment; callbacks, token refresh and
   subscription behavior retain their contracts. A callback can never attach a merchant to the wrong workspace.
9. Change language/time zone, revisit direct links, and verify server/client output, titles, dates, currency and Urdu
   rendering. Check all nine catalog bundles and job/email translation independently of browser requests.
10. Enable maintenance and simulate a feature-flag/DB outage. Confirm allowed public/health paths, requested-URL handling,
    correct HTML/API 503 behavior, no shared caching and the separate background-execution pause control.

## Failure drills

Use controlled faults and isolated resources. For each drill, record the persisted state before failure, expected
retry/repair action, resulting provider effect and final ledger state. Preserve the same operation/event identity
through retries. Do not create production commerce effects to test duplicate handling.

| Fault | Required result |
| --- | --- |
| DB transaction fails before commit | No published business job and no partially accepted event |
| Process stops after commit but before queue publish | Scheduled outbox sweep eventually delivers the committed work |
| Publish succeeds but outbox update fails | Duplicate delivery resolves to one valid job execution/result |
| Two consumers claim the same job | One fenced owner; stale completion rejected; no uncontrolled duplicate side effect |
| Node lease sweeper runs while Workflow sleeps | Workflow-owned job remains owned and is not reclaimed by the old executor |
| Workflow start succeeds but DB recording fails | Retry locates/confirms the stable instance and does not start a second business operation |
| Provider times out after accepting a create | Reconcile by provider identity or surface explicit attention state before any repeat create |
| Rate limit, provider outage or long report delay | Bounded retries/durable waits preserve progress and avoid nested retry storms |
| Job cancelled or revision superseded mid-flight | Future work stops and stale writes fail; already-completed external effects remain recorded |
| One SQS batch item fails | Successful items acknowledge after durable receipt; failed item retries with stable identity |
| Ingress DB unavailable or bridge credential invalid | No success acknowledgement for an unrecorded event; retry/DLQ behavior is observable |
| Cron trigger or best-effort wakeup missed | Durable due-work/daily identity is recovered without duplicate reconciliation effects |
| Deployment replaces code with active Workflows | Compatible instances complete or follow the rehearsed recovery path without lost checkpoints |
| R2 switch followed by new writes/deletes and rollback | Reverse delta/deletion reconciliation restores a consistent object set before endpoint reversal |
| Old DB backup restored | Matching retained documents can be retrieved; reconciliation occurs before external writers resume |
| Secrets/certificates rotate or expire | Invalid TLS is rejected; rotation procedure restores service without disabling verification |

## Budgets, evidence and stop conditions

Set measured budgets in M0 and include them in the M5 release package. Proposed starting targets are no more than a
10% regression in p95 latency for representative protected reads/mutations under the same workload, and no worse error
rate than the agreed baseline/SLO. These are proposed thresholds, not observed results. Compare cold/warm behavior,
browser load/interaction, and database round-trip time separately. Record workload, concurrency, region, sample window
and baseline uncertainty; a single request is not performance evidence.

Define maximum queue age, job completion delay, connection use and document-processing concurrency from business needs
and runtime measurements. Establish memory/CPU headroom against the selected platform limits; passing one maximum PDF
alone does not prove concurrent safety. Record a monthly cost envelope including Railway DB/backups and egress,
Cloudflare services, AWS and any container exception. Agree on RPO/RTO, write pause and observation duration before
production; leave no blank value in the concrete release package.

Zero-tolerance release failures include cross-workspace disclosure, lost committed jobs, missing referenced documents,
unverified database TLS, unauthorized provider writes and unresolved ambiguous creates that would be blindly retried.
Any such finding holds the affected release. A p95/error/queue-age/cost budget breach triggers investigation and an
explicit release decision rather than a silent threshold increase. Third-party outages are recorded and diagnosed;
they do not justify marking an untested integration as passing.

The release record contains the tested commit/artifact, package/runtime versions, resource identities without secret
values, migration state, route coverage, CI/browser links, runtime profiles, manifests, failure-drill results, budget
comparison, documented exceptions and rollback owner. Keep evidence near this specification or link stable CI artifacts;
do not commit credentials, personal data, customer documents or raw production logs.

After routing switches, observe representative load and at least one daily reconciliation cycle, plus representative
delayed/report jobs. Use the [cutover runbook](cutover.md) for pause, rollback and retirement. Rollback restores compatible
code/ownership/storage routing; it never pretends to undo completed emails or merchant-side changes.
