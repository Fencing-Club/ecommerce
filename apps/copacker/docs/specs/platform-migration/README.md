# TanStack Start and Cloudflare migration specification

Status: implementation started, October 15, 2026, on `codex/tanstack-start` in the isolated migration worktree.
[Compatibility evidence](compatibility.md) records the completed checks and remaining work. The main app still uses
Next.js; no milestone or production cutover is complete. This specification does not authorize a production cutover.

Move web hosting, private object storage and background execution to **Cloudflare Workers, R2, Queues and Workflows**.
**Postgres stays on Railway for this entire effort**, including the existing staging and production databases and
scheduled backups. Retain WorkOS, Resend and the commerce integrations. **TanStack Start is the selected replacement
for Next.js.** The compatibility spike determines how to implement it, rather than reopening the framework choice.
Keep Railway's worker until its replacement passes recovery and duplicate-delivery tests. A later database migration,
potentially to Neon, is a separate effort.

- [Current and proposed architecture](architecture.md)
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
database engine, migrate Railway Postgres, implement other planned product specs, or require experimental React Server
Components. Existing contract defects discovered during the port get a separate decision; accidental behavior changes
must not be hidden inside framework work.

| Decision | Plan |
| --- | --- |
| Framework and hosting | TanStack Start with TanStack Router, Vite and the Cloudflare Vite integration; SSR and server routes on Workers |
| Query-string state | Keep nuqs 2.10.1's experimental TanStack Router adapter for the two existing uses; the local/deployed trial passed |
| Client requests | Keep Redux Toolkit Query, current HTTP contracts, React Hook Form and Zod; do not introduce TanStack Query in the same migration |
| Localization | Preserve catalogs and locale behavior; propose standalone `use-intl`, with the dependency decision recorded before implementation |
| Identity | Keep WorkOS and custom authentication screens; prove supported Start SDK session APIs before porting the remaining pages |
| Database | Keep Railway Postgres, Drizzle and `pg`; use Hyperdrive with verified TLS and query caching disabled |
| Private files | Separate private R2 buckets per environment; preserve authenticated downloads and document validation |
| Background work | Postgres ledger plus transactional inbox/outbox, Queues, Workflows and Cron; retain necessary AWS notification transport |
| Local services | Keep the current local Postgres workflow initially; Podman is an optional compatibility task, not a Cloudflare deployment dependency |
| Deployment tooling | Use `cf` for Copacker; leave the existing Wrangler-based Turbo cache application alone |

Use [delivery.md](delivery.md) as the implementation backlog. Task IDs are stable planning references, not created
GitHub issues. Milestone completion requires recorded evidence from [verification.md](verification.md), not only merged
code. Record dependency choices and compatibility results beside this specification before implementation changes add
libraries, in accordance with the repository's preferred-stack policy.

## Database boundary: retain Railway Postgres

Copacker already uses Postgres through Drizzle and `pg`. Its schema declares 40 tables, including JSONB and PostgreSQL
arrays. Business operations use transactions and row locks; the job processor claims work with
`FOR UPDATE SKIP LOCKED`. Sales queries use PostgreSQL JSON operators and functions. These are reasons to preserve
Postgres independently of branching. See [schema](../../../src/db/schema.ts), [queue](../../../src/server/queue.ts),
[connections](../../../src/server/connections.ts) and [sales](../../../src/server/sales-orders.ts).

| Area | This effort | Later effort |
| --- | --- | --- |
| Database hosting | Existing Railway Postgres remains authoritative | Evaluate and migrate the database separately |
| SQL and schema | Retain Drizzle, `pg`, transactions and committed migrations | Preserve Postgres semantics in any later provider move |
| Connectivity | Add verified Workers-to-Railway connectivity through Hyperdrive | Repoint and validate connectivity during a later DB migration |
| Database branching | Keep local Docker and isolated CI databases; no Neon provisioning | Evaluate Neon branching with the later migration |
| Recovery | Keep Railway scheduled backups and prove restoration | Review the future provider's recovery policy separately |

No database export/import, replication cutover, database-engine replacement or database-provider retirement is in scope.
Application schema changes required for the new job architecture still use the normal Drizzle migration process.

For Workers, retain Drizzle plus `pg` through **Hyperdrive connected to Railway Postgres**. Railway's private hostname
is not directly reachable from Workers. Prove the public TCP proxy path with Railway's CA and certificate verification
before the web cutover; the existing operations guide specifies `verify-ca`. Use `verify-full` only when the hostname
and certificate support it. Never disable certificate verification to make the connection work. Confirm account support
and configure the CA explicitly in Hyperdrive. Sources: [current database access](../../operations.md#databases-and-migrations)
and [Hyperdrive TLS configuration](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/).

Use invocation-scoped clients in place of the current process-wide pool. Migrations use a separate direct Railway
connection and migration role, with the required CA when connecting through the public proxy.
Keep query caching disabled initially: permissions, document release status, stock, job state and token refreshes need
fresh reads. Hyperdrive is a connection service, not the database. Benchmark region placement and sequential queries;
placing the web runtime at the edge does not make a regional Postgres database local to every user.
Sources: [Hyperdrive behavior](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) and
[connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/).

Retained Node services continue using Railway's private connection and their existing pool. Budget their connections
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
Cloudflare Containers separately if moving that compute is useful; Railway Postgres remains regardless. Do not reduce
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

## Environments, deferred branching and cost

Keep local Docker Postgres, isolated CI databases, and the existing Railway staging and production databases. Automatic
database branches are not a deliverable. If a cloud preview needs writes, provide a separately isolated nonproduction
Postgres database and fixtures, or use the existing serialized staging workflow; never bind a disposable preview to
production or let concurrent previews overwrite a shared staging dataset.

Database isolation must precede binding any preview runtime. Give each preview its own database role/Hyperdrive binding,
private storage namespace or bucket, jobs, secrets and allowed origins. Disable live subscriptions, scheduled sync,
real email and commerce writes by default. Copied production connection tokens and pending jobs are unsafe: even a
database-isolated preview can rotate Shopify tokens or create real shipments. R2 objects, WorkOS users, AWS queues and
merchant accounts require their own environment isolation. Neon remains a candidate for a later database migration,
when branching, data transfer, recovery and preview-resource lifecycle can be designed and estimated together.

Do not promise savings without a baseline. Capture Railway's web/worker/DB/bucket spend, request CPU, DB size and active
hours, object operations, event rates, workflow steps and peak file memory. Model retained Railway database/backups and
database network egress, Workers/Hyperdrive, R2, Queues, Workflows, AWS transport and any container fallback. Measure
cross-provider database latency and traffic; keeping Postgres in Railway means its hosting cost remains. No Neon costs
or database scale-to-zero savings belong in this effort's model.
Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) and
[Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/).

Before committing to production dates, resolve measured data/object sizes, acceptable write downtime, recovery targets,
peak document-processing requirements and the verified Cloudflare-to-Railway connection path. The first implementation
milestone is the compatibility proof, followed by R2 and web/job cutovers. Railway Postgres stays authoritative throughout.

## Definition of done

Next is absent from Copacker's runtime, build, development, stories and test integration. All inventoried routes and
supported user journeys pass on deployed Start; no server credentials or privileged data enter client bundles or
unauthorized loader responses. Private documents and job recovery meet their existing product contracts. Production
has completed its agreed observation window, operations and domain documentation reflect the deployed state, and only
replaced resources have been retired. An approved container-processing exception may remain; it must have an owner,
bounded scope, monitoring and recovery instructions. Railway Postgres and required AWS transport remain intentional
dependencies, not unfinished migration tasks.
