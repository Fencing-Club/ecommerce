# TanStack Start and Cloudflare migration specification

Status, October 16, 2026: TanStack Start, Neon, private R2 and hosted PR previews are active. The final release passed
145 browser tests on both its preview and stable staging domain. The first production web cutover was rolled back
after exposing an eBay EventBridge runtime failure; the corrected release must pass qualification again.
[Acceptance](acceptance.md) records the exact release, verification, infrastructure applies and recovery window.
[Architecture](architecture.md) shows the state before cutover and the release target; [compatibility evidence](compatibility.md)
retains the earlier trials. The background-executor migration remains separate.

Move web hosting, private object storage and background execution to **Cloudflare Workers, R2, Queues and Workflows**.
Retain WorkOS, Resend and the commerce integrations. **TanStack Start is the selected replacement for Next.js.**
Keep Railway's worker until its replacement passes recovery and duplicate-delivery tests.

**October 16 integration update:** PR 17 separately introduced Neon databases, isolated PR database branches and
Cloudflare wake signals for the retained Node executor. This branch incorporates that work. It supersedes the original
Railway-only database assumptions in the planning articles. [Neon operations](../../neon.md),
[background jobs](../../background-jobs.md), and the updated [cutover requirements](cutover.md) describe the current
contracts. Earlier deployed qualification against Railway is historical evidence; Neon Hyperdrive and queue delivery
must be qualified before release. Hosted application previews are implemented; full Cloudflare job execution remains
separate work. Private storage has been transferred and verified in R2, including the retained Node readers/writers.

- [Current and proposed architecture](architecture.md)
- [Cutover acceptance and recovery window](acceptance.md)
- [Implementation decisions and compatibility evidence](compatibility.md)
- [Framework, authentication and frontend migration](framework.md)
- [Database, storage and background execution](backend.md)
- [Route and endpoint inventory](routes.md)
- [Tasks, milestones, dependencies and estimates](delivery.md)
- [Verification and release criteria](verification.md)
- [Cutover, recovery and acceptance gates](cutover.md)
- Current operating contracts: [operations](../../operations.md), [domains](../../domains.md),
  [notifications](../../notifications.md), [API](../../api-contract.md), [authentication](../../auth.md).

## Outcomes and scope

The first releasable outcome is the existing Copacker product running on TanStack Start in Cloudflare Workers, with
the same public URLs, workflows, permissions, integrations and supported files. The final platform outcome also moves
private files, static Storybook and suitable background work to Cloudflare, with a documented processing exception if
large files require a container. Framework migration and worker replacement have separate release gates.

The migration does not redesign screens, replace the client data layer, change identity providers, introduce a new
database engine, repeat the separately managed Neon data transfer, implement other planned product specs, or require experimental React Server
Components. Existing contract defects discovered during the port get a separate decision; accidental behavior changes
must not be hidden inside framework work.

| Decision | Plan |
| --- | --- |
| Framework and hosting | TanStack Start with TanStack Router, Vite and the Cloudflare Vite integration; SSR and server routes on Workers |
| Query-string state | Keep nuqs 2.10.1's experimental TanStack Router adapter for the two existing uses; the local/deployed trial passed |
| Client requests | Keep Redux Toolkit Query, current HTTP contracts, React Hook Form and Zod; do not introduce TanStack Query in the same migration |
| Localization | Preserve catalogs and locale behavior; propose standalone `use-intl`, with the dependency decision recorded before implementation |
| Identity | Keep WorkOS and custom authentication screens; prove supported Start SDK session APIs before porting the remaining pages |
| Database | Keep Postgres, Drizzle and `pg`; use Neon through Hyperdrive with verified TLS and query caching disabled |
| Private files | Separate private R2 buckets per environment; preserve authenticated downloads and document validation |
| Background work | Postgres ledger plus transactional inbox/outbox, Queues, Workflows and Cron; retain necessary AWS notification transport |
| Local services | Keep the current local Postgres workflow initially; Podman is an optional compatibility task, not a Cloudflare deployment dependency |
| Deployment tooling | Use `cf` for Copacker; leave the existing Wrangler-based Turbo cache application alone |

Use [delivery.md](delivery.md) as the implementation backlog. Task IDs are stable planning references, not created
GitHub issues. Milestone completion requires recorded evidence from [verification.md](verification.md), not only merged
code. Record dependency choices and compatibility results beside this specification before implementation changes add
libraries, in accordance with the repository's preferred-stack policy.

## Database boundary: integrate Neon without changing SQL semantics

Copacker already uses Postgres through Drizzle and `pg`. Its schema declares 40 tables, including JSONB and PostgreSQL
arrays. Business operations use transactions and row locks; the job processor claims work with
`FOR UPDATE SKIP LOCKED`. Sales queries use PostgreSQL JSON operators and functions. These are reasons to preserve
Postgres independently of branching. See [schema](../../../src/db/schema.ts), [queue](../../../src/server/queue.ts),
[connections](../../../src/server/connections.ts) and [sales](../../../src/server/sales-orders.ts).

| Area | Current contract |
| --- | --- |
| Database hosting | Neon staging and production branches from PR 17; verify live origins before cutover |
| SQL and schema | Retain Drizzle, `pg`, transactions and committed migrations |
| Connectivity | Web uses uncached Hyperdrive to the direct Neon endpoint; Node executor uses pooled Neon |
| Database branching | Keep local Docker and isolated CI databases; trusted PRs receive a private Neon database branch |
| Recovery | Verify Neon's actual recovery history and a matching document restore; do not assume Railway retention |

No database export/import, replication cutover, database-engine replacement or database-provider retirement is in scope.
Application schema changes required for the new job architecture still use the normal Drizzle migration process.

For Workers, retain Drizzle plus `pg` through **Hyperdrive connected to Neon Postgres**. Prove TLS certificate and
hostname verification before the web cutover. Never disable verification to make a connection work or reuse the old
Railway CA for Neon. Sources: [current database access](../../neon.md#connections-and-releases)
and [Hyperdrive TLS configuration](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/).

Use invocation-scoped clients in place of the web's process-wide pool. Migrations use a separate direct Neon
connection and migration role, with verified TLS and a session advisory lock; never use a transaction pooler.
Keep query caching disabled initially: permissions, document release status, stock, job state and token refreshes need
fresh reads. Hyperdrive is a connection service, not the database. Benchmark region placement and sequential queries;
placing the web runtime at the edge does not make a regional Postgres database local to every user.
Sources: [Hyperdrive behavior](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) and
[connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/).

Retained Node services use the pooled Neon connection and their existing pool. Budget their connections
alongside Hyperdrive's pool during the transition. Test the Shopify refresh-token transaction explicitly: it holds a row lock
across the provider request to prevent competing refreshes. Do not remove that serialization as a pooling optimization.

## Framework boundary

TanStack Start must be ready before the web-runtime cutover. R2 and background-job work can progress separately.
There is no intermediate port to a Next-compatible Cloudflare adapter in this plan.

Start has a documented Workers deployment through Vite. Use typed routing, explicit data loading and
server-only execution boundaries. Its React Server Components support is currently experimental and opt-in. Port
Copacker's server-rendered pages to ordinary Start routes, loaders and explicit server boundaries instead of making
experimental RSC parity a dependency. Sources:
[Start on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) and
[Start migration guide](https://tanstack.com/start/latest/docs/framework/react/migrate-from-next-js).

The inspected checkout has **40 `page.tsx` files and 62 `route.ts` handlers**. These counts exclude layouts and stories.
No `use server` declarations were found: many mutations already use HTTP endpoints and Redux Toolkit Query, including
`/api/action`. Preserve those contracts during the port instead of simultaneously replacing the client data layer.

| Area | Required framework work |
| --- | --- |
| Routes and rendering | Port layouts, async pages, metadata, error/403/404 handling, redirects, navigation and route refresh behavior; keep URLs |
| Authentication | Replace `authkit-nextjs` integration, cookies and proxy; preserve custom sign-in, password reset, invitations, workspace switching and authorization |
| Localization | Replace Next-specific request integration; preserve message catalogs, server/client translation, time zones, RTL and locale fonts |
| Application endpoints | Port handlers while retaining validation, origin checks, response formats and provider callback paths |
| Styling and assets | Use the existing vanilla-extract Vite integration, Tailwind and React Compiler; replace Next font/image/script handling where used |
| Caching and maintenance | Audit `unstable_cache`; replace process-based WorkOS flag polling with a bounded request-compatible approach |
| Test and dev tooling | Update Next-specific Storybook setup/mocks, Playwright launch/build paths, Portless and health checks |

WorkOS remains the identity provider. The Start SDK trial found a session-cookie ordering conflict; the implementation
uses WorkOS's public session toolkit with request-scoped handling. Deployed login/refresh/logout checks passed; the
remaining custom flows still need app-level acceptance. See [compatibility evidence](compatibility.md) and the
[WorkOS session toolkit](https://github.com/workos/authkit-session).

## The difficult part: background execution and documents

The [current worker](../../../src/server/worker.ts) is a persistent Node process: three job loops, separate SQS
long-poll loops, and a reconciliation scheduler. Workers require event-driven entry points. Changing the UI framework
does not address this.

The proposed design uses Queues for short work and delivery, Workflows for resumable multi-step work, and Cron for
reconciliation and outbox recovery. Preserve the existing job ledger, revision checks, provider deduplication and
per-workspace/source concurrency controls. Introduce a transactional outbox so a committed business change cannot lose
its job if queue publication fails. Large documents and reports travel by R2 object key, not inside messages.

Queues deliver at least once: retries must not create duplicate Amazon shipments, send duplicate emails, rotate tokens
concurrently or apply stale revisions. Workflow checkpoints do not by themselves make external side effects exactly
once. Sources: [delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) and
[Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/).

Runtime proof is mandatory for `pdf-lib`, `pdfjs-dist`, `yauzl`, ExcelJS, AWS SDKs and Node crypto/streams. Today PDFs can
be 32 MiB and 1,000 pages; uploads, splitting and downloads buffer bytes, and imports base64-encode PDFs. The AI import
has an eight-minute deadline. Test realistic worst cases, not just small fixtures. Workers currently provide 128 MB per
isolate, shared by concurrent requests; queue consumers have a 15-minute wall-time limit. Workflows allow durable waits
but do not remove the memory/CPU constraints of processing a PDF. Sources:
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and
[Queues limits](https://developers.cloudflare.com/queues/platform/limits/).

If large-file processing cannot meet those constraints, keep it in a container service while the rest moves. Evaluate
Cloudflare Containers separately if moving that compute is useful. Do not reduce
supported file sizes or promise an all-Workers implementation before measurement. Prefer isolated processing jobs and streamed downloads;
any asynchronous-upload UX change needs its own acceptance tests and must preserve validation before release.

## Delivery sequence and effort

The [delivery plan](delivery.md) defines seven milestones, task dependencies and completion evidence. Allow provisionally
**32–59 engineer days, approximately 6–12 engineer weeks**, for the full framework and platform scope. This includes
foundation work and release qualification explicitly. It is a planning judgment for an engineer familiar with the app,
not a commitment. Re-estimate after M0. Calendar time also
includes agreed observation windows, provider setup and any contingency processing work.

The web release does not wait for all background work to move. R2 and Storybook are independently deployable; background
work migrates by job family. Every production transition follows [cutover.md](cutover.md). No database-provider move or
database branching is included in the estimate.

Use `cf` for new Copacker Cloudflare configuration under repository policy; Copacker has no Wrangler configuration in
the inspected checkout. Verify beta CLI capabilities and configuration support against the pinned version in M0.

## Environments, database previews and cost

Keep local Docker Postgres and isolated CI databases. PR 17 supplies separate Neon staging and production branches
and automatic isolated PR database branches. The preview job applies migrations without application, commerce or
storage credentials. Hosted app previews remain deferred; never bind one to production or share a writable staging dataset.

Database isolation must precede binding any preview runtime. Give each preview its own database role/Hyperdrive binding,
private storage namespace or bucket, jobs, secrets and allowed origins. Disable live subscriptions, scheduled sync,
real email and commerce writes by default. Copied production connection tokens and pending jobs are unsafe: even a
database-isolated preview can rotate Shopify tokens or create real shipments. R2 objects, WorkOS users, AWS queues and
merchant accounts require their own environment isolation. Database-only previews do not qualify these future
application resources; their lifecycle and isolation need separate implementation and acceptance.

Do not promise savings without a baseline. Capture Railway's web/worker/DB/bucket spend, request CPU, DB size and active
hours, object operations, event rates, workflow steps and peak file memory. Model Neon compute/storage/recovery and
database network egress, Workers/Hyperdrive, R2, Queues, Workflows, AWS transport and any container fallback. Measure
cross-provider database latency and traffic. Confirm actual idle compute behavior; hourly recovery, jobs and user
traffic still consume database compute, so scale-to-zero savings must be measured.
Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) and
[Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/).

Before committing to production dates, resolve measured data/object sizes, acceptable write downtime, recovery targets,
peak document-processing requirements and the verified Cloudflare-to-Neon connection path. The first implementation
milestone is the compatibility proof, followed by R2 and web/job cutovers. Preserve one authoritative database per environment.

## Definition of done

Next is absent from Copacker's runtime, build, development, stories and test integration. All inventoried routes and
supported user journeys pass on deployed Start; no server credentials or privileged data enter client bundles or
unauthorized loader responses. Private documents and job recovery meet their existing product contracts. Production
has completed its agreed observation window, operations and domain documentation reflect the deployed state, and only
replaced resources have been retired. An approved container-processing exception may remain; it must have an owner,
bounded scope, monitoring and recovery instructions. Neon Postgres and required AWS transport remain intentional
dependencies, not unfinished migration tasks.
