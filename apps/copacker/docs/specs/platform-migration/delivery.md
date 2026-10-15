# Tasks, milestones and delivery plan

Part of the [migration specification](README.md). M0, the request-context portions of M1 and frontend preparation in M3
are in progress;
no checkbox below is fully complete. See [compatibility evidence](compatibility.md) for verified substeps and remaining
work. This document does not create issues or schedule releases.
The web can ship on Start before the background-worker migration finishes.

## Milestone sequence and effort

Estimates are engineering effort for someone familiar with Copacker, with normal review and repair included. They are
not elapsed dates, and parallel work does not eliminate dependencies. Provider configuration, observation windows,
unusual data volumes and a substantial document-processing fallback can extend the schedule. Re-estimate after M0.

| Milestone | Deliverable | Dependencies | Effort | Exit evidence |
| --- | --- | --- | --- | --- |
| M0: compatibility and baseline | Deployed proof, measured limits and recorded implementation decisions | None | 3–5 days | Core auth/DB/locale/nuqs slice works; each document workload has a viable executor |
| M1: platform foundation | Typed runtime context, isolated environments, CI/build/deploy and DB access | M0 decisions | 3–5 days | Fresh checkout builds; isolated staging deployment and serialized migrations work |
| M2: storage and static assets | Private R2 migration package and static Storybook deployment | M0, M1 environment foundations | 2–4 days | Object manifest/recovery rehearsal; private download and stories parity |
| M3: Start web parity | All page/API batches and frontend tooling migrated | M0, M1; M2 for final private storage tests | 10–20 days | No Copacker Next dependency; complete web acceptance evidence |
| M4: durable jobs and ingress | Inbox/outbox, queue/Workflow executors, bridge, recovery tools | M0, M1; M2 for artifact storage | 8–15 days | Every job family passes retry, ownership and side-effect recovery drills |
| M5: release qualification | Security, load, recovery, cost and operational acceptance | M2/M3 for web; M4 for job release | 3–5 days | Applicable verification gates pass and release evidence is reviewable |
| M6: staged cutovers and retirement | Production web, then job-family transitions, observation and cleanup | Relevant M5 gates for each transition | 3–5 days | Stable observation, reconciled data, completed rollback drills and updated live docs |

Total: **32–59 engineer days, approximately 6–12 engineer weeks**. Database-provider migration, automatic database
branching, product redesign and unrelated feature specs are excluded. M0/M1/M2/M3 form the main path to the web release;
M4 can be developed after the foundation without waiting for all page conversions. M5 has separate web and jobs gates,
and M6 is a set of gated transitions, not one final big switch. The web milestone may complete while the Node worker
remains the sole job executor.

Use small PRs that each build and preserve a coherent contract. Temporary coexistence is limited to deployed release
boundaries, with an owner and removal task. Keep one canonical implementation per operation; do not add version-suffixed
services, duplicate page trees in the final app, or permanent compatibility aliases. Preserve unrelated working-tree
changes and keep migration worktrees under the repository's required worktree root.

## M0: inventory and compatibility proof

Suggested responsibility: implementation lead with platform and product input. Work only against local/isolated staging
resources. M0 selects implementation details; TanStack Start and leaving Next are already selected.

- [ ] **M0-01 — Baseline contracts.** Refresh [routes.md](routes.md), framework imports, dependency/runtime inventory,
  current CI coverage and live resource/deployed revisions. Capture representative fixtures for each role and job kind.
- [ ] **M0-02 — Measure the existing service.** Record web latency/error rate, build/cold-start behavior, DB query/connection
  load, job duration/queue age, object totals, peak document memory, infrastructure spend and recovery capability.
- [ ] **M0-03 — Pin the framework combination.** Prove Start/Router, React Compiler, Vite, Cloudflare plugin, vanilla-extract,
  Storybook and the WorkOS SDK together. Inspect `cf` configuration/build/deploy support and record exact versions and
  compatibility flags/date. Resolve required library discussions before dependency changes.
- [ ] **M0-04 — Deployed vertical slice.** Exercise custom login, session refresh/logout, workspace authorization,
  localized overview data, one POST mutation with CSRF checks, fresh loader data and a private R2 download on Workers.
  Prove existing encrypted-token decryption and multiple response cookies. Record session-cookie compatibility.
- [ ] **M0-05 — Database proof.** Validate Hyperdrive-to-Railway TLS/CA, transactions, locks, token-refresh serialization,
  concurrent clients, failure/reconnect behavior, latency and connection budget. Query caching stays disabled.
- [ ] **M0-06 — nuqs trial.** Test both existing consumers through the TanStack Router adapter, including SSR/hydration,
  direct links, back/forward, invalid values and preservation of other search keys. Record keep/fallback decision.
- [ ] **M0-07 — Document and SDK proof.** Exercise maximum supported PDFs, representative generated packets, compressed
  reports and XLSX imports/exports under concurrency. Include AI requests, tracing, email rendering and provider SDKs.
  Record CPU/memory and select Workers or a scoped processor for each failing workload.
- [ ] **M0-08 — Freeze acceptance decisions.** Agree on recovery objectives, downtime, performance/cost budgets, supported
  session transition, observation windows and any processor exception; resolve the decision register and re-estimate.

Exit: a working deployed slice plus recorded results, not just a successful bundle. An unresolved custom-session, TLS
or document-executor blocker stops the dependent work. A failing nuqs trial is resolved with the small Router-search
fallback; it does not reopen the framework selection.

## M1: runtime and delivery foundation

Suggested responsibility: platform/backend engineer, with the web engineer reviewing request boundaries.

- [ ] **M1-01 — Configuration and isolation.** Define Copacker's `cf` project configuration, generated bindings and
  validated environment contract. Separate staging/production resources, credentials, origins and execution controls.
  Keep production credentials out of previews. Enable logs and traces explicitly.
- [ ] **M1-02 — Database context.** Replace Worker-path global DB access with invocation-scoped access and test all error
  cleanup. Preserve the Node pool for the retained worker until its cutover; keep domain queries canonical.
- [ ] **M1-03 — Server boundaries.** Establish server-only modules, router/request context, explicit CSRF policy, safe DTO
  serialization and import-protection failures. Audit shared packages and public environment values.
- [ ] **M1-04 — Build and type generation.** Establish a clean production build, route/binding generation, TypeScript 7
  checks, Turbo outputs/cache inputs, knip configuration and artifact naming based on actual build output.
- [ ] **M1-05 — Local development.** Adapt Portless launch/health logic for Workers development and separate E2E runtime
  state/output. Preserve worktree domains, host-only cookies, system CA trust and isolated local Postgres. Document how
  Node background work accesses local storage while Workers use bindings.
- [ ] **M1-06 — CI and migrations.** Add Worker build/runtime checks and staging deployment. Implement one serialized
  migration runner with a direct verified Railway connection. Keep promotion tied to the tested commit/artifact and
  expected `/api/health` commit; avoid simultaneously activating the old predeploy migration path.
- [ ] **M1-07 — Optional Podman evaluation.** If pursued, prove the current Compose/Postgres workflow, volume persistence,
  readiness, cleanup and Windows networking before changing developer defaults. Record the result; this is not an exit
  prerequisite and does not replace Cloudflare's local runtime.

Exit: a fresh checkout can build/type-check and exercise the deployed proof against the correct isolated bindings.
CI can deploy and roll back a staging version with intact data and a single migration runner.

## M2: private storage and Storybook hosting

Suggested responsibility: platform engineer with document/security review.

- [ ] **M2-01 — Storage contract.** Verify R2 put/get/delete via the retained Node S3 client, then native Workers bindings.
  Preserve private access, content types, object keys, filename headers, release checks and upload validation.
- [ ] **M2-02 — Copy and reconcile.** Prepare an idempotent copy process and manifest covering every referenced object,
  count, size and verified checksum. Include deletion reconciliation and partial-copy restart behavior.
- [ ] **M2-03 — Recovery rehearsal.** Rehearse final writer pause, delta copy, switching both Node services, reverse delta
  rollback and restoration of DB records with matching objects. Agree on document retention/backup policy.
- [ ] **M2-04 — Static Storybook.** Build and deploy Storybook through Workers Static Assets using the converted Vite
  configuration as it becomes available. Preserve its domain, fixtures, MSW behavior and access policy.
- [ ] **M2-05 — Prepare storage cutover.** Produce the concrete environment manifest, timing, health checks and rollback
  evidence for M6-01. Do not delete the old bucket or repurpose the public media bucket.

Exit: verified nonproduction copy and rollback plus private-file acceptance. A production storage switch is a distinct
release action under M6-01, and can occur before the web migration.

## M3: TanStack Start application

Suggested responsibility: web engineer with backend/security review for auth, mutations and document routes.

- [ ] **M3-01 — Root and navigation.** Port root/pathless layouts, typed links, pending/error/forbidden/not-found handling,
  head metadata, theme/skip link and routing middleware. Keep URL/status semantics.
- [ ] **M3-02 — Authentication and authorization.** Complete the custom WorkOS flows and server-side workspace/role checks.
  Preserve return-path validation, cookies, origin policy and multi-tab workspace/sign-out cache clearing.
- [ ] **M3-03 — Localization and visual foundations.** Replace Next-specific translation integration, keep all locales,
  time zones, typed catalogs, marketing namespace selection, RTL, fonts and existing styles. Keep React Compiler.
- [ ] **M3-04 — P1 public/system pages.** Port the seven pages, forms, maintenance response behavior and metadata assets.
  Verify HTML, robots/sitemap, canonical URLs and setup behavior before calling the batch complete.
- [ ] **M3-05 — P2 identity/onboarding pages.** Port the eight pages and three auth handlers; cover expired/replayed auth
  state, password reset, invitation, onboarding and existing callback registrations.
- [ ] **M3-06 — P3 workspace/partners pages.** Port seven pages and related data/actions. Exercise workspace switch, role
  denial, settings, partner deep links and redirects. Use the accepted nuqs trial result.
- [ ] **M3-07 — P4 catalog/product pages.** Port six pages, imports/exports, product editing and price restrictions. Prove
  product-import query state and authorized downloads.
- [ ] **M3-08 — P5 inventory/sales pages.** Port three pages and related API behavior. Preserve calculations, query/filter
  state, source scopes, sync progress and mutation freshness.
- [ ] **M3-09 — P6 order/shipment pages.** Port nine pages, revision/proposal flows, imports, labels and packets. Verify
  buyer/supplier/forwarder journeys and document withdrawal. Replace shipment server caching deliberately.
- [ ] **M3-10 — HTTP and data parity.** Reconcile all 59 API handlers and `/api/action` operations, including provider
  callbacks/webhooks, raw signatures, binary responses, body limits, status/error schemas and cache/security headers.
- [ ] **M3-11 — Stories and browser tooling.** Replace Next Storybook/mocks with real memory-router and locale fixtures;
  keep sibling stories with play tests. Update test discovery/coverage and production Workers Playwright launch paths.
  Run integrated-browser acceptance for each changed surface at desktop/mobile with keyboard checks.
- [ ] **M3-12 — Remove Next.** Remove obsolete app/proxy/config/generated type files, packages, environment assumptions,
  build outputs and web-container scripts when no consumer remains. Verify all 31 refresh call sites have an explicit
  invalidation strategy. Update applicable developer docs and the framework convention in the same implementation PRs.

Each page batch includes its server data, actions, stories and browser evidence; it is not complete after a route file
is renamed. Exit: all web acceptance checks pass on deployed Start and no Next integration remains in Copacker. The
existing Node worker can still own background execution.

## M4: jobs, event delivery and operational recovery

Suggested responsibility: backend/platform engineer with domain review for provider writes.

- [ ] **M4-01 — Ledger and schema.** Design missing inbox/outbox, execution ownership and side-effect capabilities using
  existing records where possible. Add indexes/constraints and new migrations; review retention and expand/contract
  compatibility. Preserve pending, delayed, running and failed jobs and manual retry state.
- [ ] **M4-02 — Outbox delivery.** Implement transactional enqueue, leased publication, best-effort wakeup, periodic
  recovery and long-delay scheduling. Fault-test commit-before-publish and publish-before-mark crashes.
- [ ] **M4-03 — Execution ownership.** Apply ownership to both Node claiming and expired-lease reclamation, not just the
  new consumer. Fence stale completions and coordinate provider/workspace concurrency. Prevent sleeping Workflows from
  being reclaimed by the Node heartbeat logic.
- [ ] **M4-04 — Short jobs.** Move email, event and bounded subscription/compliance handlers with durable deduplication,
  bounded retries, provider backoff and user-visible terminal outcomes. Validate every kind in [backend.md](backend.md).
- [ ] **M4-05 — Sync/report Workflows.** Port stock/sales/Shopify/Amazon Ads pagination and report waits to durable steps.
  Preserve checkpoints, watermarks, cancellation, throttling and R2 artifact cleanup.
- [ ] **M4-06 — Shipment/import Workflows.** Port Amazon and AI import orchestration, retaining revision checks and
  ambiguous-create recovery. Integrate the measured processing fallback if required; preserve supported file behavior.
- [ ] **M4-07 — SQS bridge and eBay ingress.** Implement the selected bridge, authenticated envelope, stable event identity,
  inbox commit-before-ack, partial-batch handling, DLQs and controlled reader handover. Preserve existing callbacks.
- [ ] **M4-08 — Schedules and repair.** Replace persistent timers with Cron-triggered durable reconciliation and outbox
  recovery. Preserve daily identity/time and missed-run repair; do not activate a second production scheduler early.
- [ ] **M4-09 — Operations.** Provide pause/drain/resume, retry/reconcile, DLQ replay and stuck-Workflow procedures with
  scoped permissions, audit and alerts. Rehearse instance/code rollback after completed external side effects.

Exit: each job kind has execution parity and failure-drill evidence. No family switches solely because the queue
consumer starts successfully. Existing ownership remains authoritative until its M6-03 transition.

## M5: release qualification

Suggested responsibility: implementation lead and release operator, with product/security acceptance where applicable.

- [ ] **M5-01 — Web qualification.** Run the repository verify loop, production builds, all migrated stories and
  Playwright suites, deployed runtime tests and integrated-browser acceptance. Complete V01–V10 and V14–V16 in
  [verification.md](verification.md) to the scope of the web release.
- [ ] **M5-02 — Job qualification.** Complete V11–V13 and repeat affected DB/document/isolation tests for the new executors.
  Demonstrate recovery from duplicate delivery, expired claims, provider ambiguity, outages and deployment interruption.
- [ ] **M5-03 — Performance and cost.** Compare against the recorded baseline under the same workload and database region.
  Include cross-provider DB traffic, concurrent documents and retained processor costs; resolve budget regressions.
- [ ] **M5-04 — Recovery and runbook review.** Rehearse code/origin rollback, object reverse-delta recovery, job ownership
  rollback, credential rotation and isolated DB restore with matching documents. Measure agreed RPO/RTO.
- [ ] **M5-05 — Release package.** Record commit/artifact IDs, migration plan, resource manifest, compatibility decisions,
  acceptance evidence, thresholds, observer, rollback owner and observation duration for each proposed transition.

The web release may pass its applicable gates while jobs remain on Node. Unimplemented job gates are explicitly
deferred to that later release, never marked passed. Any exception states its affected behavior, owner and resolution.

## M6: production transitions and cleanup

Suggested responsibility: release operator, with a named rollback owner and review of the concrete release package.

- [ ] **M6-01 — Storage/static transition.** Execute the rehearsed R2 final delta and switch both document writers/readers;
  deploy Storybook on its retained domain. Reconcile manifests and retain the old bucket through observation.
- [ ] **M6-02 — Web transition.** Promote the tested Start release, run the serialized migration step, switch routing and
  verify auth, protected reads/mutations, callbacks, private downloads, locale, health/commit and caches. Preserve the
  agreed cookie/re-authentication plan. Keep the Node worker as sole executor until its family transitions.
- [ ] **M6-03 — Job-family transitions.** Pause/drain each owner, transfer its fence, enable new dispatch and reconcile
  outcomes. Switch SQS readers and schedulers deliberately. Do not change all families simultaneously by default.
- [ ] **M6-04 — Observation and reconciliation.** Observe representative interactive load and at least one daily
  reconciliation cycle; include representative delayed/report work. Compare business totals, document manifests,
  provider objects, event backlog, job completion, errors, latency and cost with the acceptance package.
- [ ] **M6-05 — Retire replaced resources.** After the agreed window and rollback decision, remove replaced Railway web,
  worker, static Storybook and bucket resources, obsolete secrets and deployment paths. Keep any approved processor,
  Railway Postgres/backups, public media, Turbo cache and required AWS transport.
- [ ] **M6-06 — Close the migration.** Update operations, domains, auth, development, E2E, stories, localization and
  notification docs to actual deployed behavior. Remove migration-only scaffolding after in-flight work drains and
  record remaining intentional dependencies and follow-up work.

Exit: [definition of done](README.md#definition-of-done) is met and the observation evidence is recorded. The detailed
ordering, pause and rollback rules in [cutover.md](cutover.md) apply to every transition.

## Decisions to record before dependent implementation

| ID | Decision/evidence required | Default or boundary | Needed by |
| --- | --- | --- | --- |
| D01 | Supported Start/Cloudflare/WorkOS/Vite versions and custom session API | Official integration, ordinary SSR; no unsupported session internals | M0 exit |
| D02 | Localization dependency agreement | Selected `use-intl` 4.14.9 in the authorized implementation; preserve catalogs/behavior | M3-03 |
| D03 | nuqs compatibility result | Keep trial adapter if all checks pass; focused Router search fallback if it fails | M3-06 |
| D04 | Railway connectivity/CA/account capability and connection budget | Verified TLS, query cache off, existing databases retained | M1-02 |
| D05 | Document executor and concurrency limits | Preserve 32 MiB/1,000-page behavior; scoped processor if necessary | M3/M4 document work |
| D06 | SQS ingress strategy and acceptable latency | Lambda bridge by default; bounded scheduled polling only by recorded choice | M4-07 |
| D07 | Downtime, RPO/RTO, object retention and observation window | Must be measured/agreed; no implied zero-downtime or data-loss promise | M2 rehearsal/M5 |
| D08 | Performance, error, queue-age and cost budgets | Use measured baseline and verification criteria; resolve regressions explicitly | M5 |
| D09 | Session transition and Workflow deployment compatibility | Preserve cookies when supported; deliberate re-authentication if required | M5 release package |
| D10 | Local container engine and optional previews | Existing local Postgres initially; Podman/previews are optional and isolated | Only if pursued |

These are implementation inputs, not reasons to leave the planning document incomplete. Resolve them with the M0 proof
and concrete measurements. No production resource, dependency or developer default is changed by this specification.
