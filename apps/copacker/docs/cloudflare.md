# Cloudflare runtime and releases

Copacker's TanStack Start application and Storybook are live on Cloudflare Workers in staging and production.
Web, private R2 and Neon migration evidence is recorded in [cutover acceptance](specs/platform-migration/acceptance.md).
Background jobs use native Queues for bounded work and Cloudflare Workflows for long jobs, with scheduled AWS readers.
See [background jobs](background-jobs.md) for claims, checkpoints, recovery and retirement gates. Public hostnames and
integration callbacks stay unchanged.

## Request boundaries

`src/routes` owns the typed route tree ([routes](routes.md)). Presentational pages in `src/app` receive explicit loader
data. Server functions
and `src/server/http` retain the existing authorization and HTTP contracts. `src/server.ts` creates invocation-scoped
authentication, localization, database, private-storage and queue-publisher contexts. A router is created per request. Database sockets
close before the request finishes; Hyperdrive query caching is disabled. Mutations recheck current database permissions.

The application retains Redux Toolkit Query and nuqs. Forms and action buttons await synchronous router invalidation
before completing; form reset also waits so pending state covers the refresh. Authenticated actions resolve the request
language before holding a domain transaction, avoiding a second profile connection inside a small Hyperdrive pool.
Draft deletion waits for navigation and invalidates the destination list, including a still-fresh cached visit.
Restock search survives report replacement while order selections reset. Authentication and workspace changes load a new document to discard old caches.
Start's import protection rejects server dependencies in browser bundles. Client environment variables use the `VITE_`
prefix only for deliberately public values, currently the restricted Google Maps browser key.

## Configuration

Use the pinned `cf` CLI and `cloudflare.config.ts`; there is no Wrangler configuration. `pnpm typegen` regenerates route
and binding types. `pnpm build` builds staging; `vite build --mode production` requires explicit production resources.
Build output is `.cloudflare/output/v0`. The build contains binding declarations, never database admin credentials.

Vite's SSR target is `webworker`, matching Cloudflare's browser export conditions with package `browser` mappings.
The AWS EventBridge browser client receives explicit region and credentials; it cannot use Node's environment
provider chain. `pnpm test:worker-webhooks` runs the built application in workerd with synthetic bindings and
intercepted outbound requests, checking eBay signatures, signed EventBridge forwarding, rejection and recovery.
The same check verifies actual WorkOS flag fetching, maintenance rejection, a missing flag and redirect rejection.
Cloudflare accepts `manual` redirect handling; non-success responses retain the last maintenance setting without
following a redirect or forwarding credentials. CI and the staging/production release runner require this check before deployment.

`pnpm test:worker-jobs` runs the same artifact against a fresh local PostgreSQL database using `TEST_DATABASE_URL`.
It applies the real migrations and tests each assigned job family, duplicate delivery, abandoned leases, failure and
recovery. It refuses remote databases, destroys only its randomly named test database, and is required in PR CI.

| Environment | Web | Database | Files |
| --- | --- | --- | --- |
| Development | Vite and local workerd, exact Portless origin | Local PostgreSQL | `.cloudflare/state/development/v3/r2` |
| Browser tests | Separate `e2e/runtime/.cloudflare/output/v0` build | Dedicated local/CI test database | `.cloudflare/state/e2e/v3/r2` |
| Staging | `copacker-staging`, no indexing | Staging Hyperdrive, caching off | Private `copacker-staging-private` |
| PR preview | `copacker-pr-<number>`, no indexing | Own Hyperdrive and Neon branch | `previews/pr-<number>/app/` folder in `copacker-staging-private` |
| Production | `copacker`, explicit custom domains | Explicit production Hyperdrive | Explicit private production bucket |

`worker:dev` uses the running web emulator's local S3 endpoint to read and write the development bucket. One emulator
owns its storage. Local credentials live in ignored `.cloudflare/storage-credentials.json`. Hosted jobs use native R2
and Hyperdrive inside each Workflow step. Never point local development at hosted provider queues.

`src/server/storage.ts` has one adapter per transport. A Worker invocation binds `r2FileStorage(env.DOCUMENTS)` with
`withFileStorage`; outside one, such as the Node worker and local tools, files go through the S3 adapter and the `S3_*`
settings. Both keep each file's key and content type.

The October 16 release replaced the early qualification artifact with the tested commit recorded in
[acceptance](specs/platform-migration/acceptance.md). The stable staging domain and its `workers.dev` alias address the
same deployment. Both environments use verified Neon Hyperdrive connections, caching disabled and five origin
connections. Private storage was transferred to R2 and verified before the web cutover. The original trials remain in
the historical [qualification record](specs/platform-migration/compatibility.md#main-application-qualification).

Required Worker secrets and optional integration secrets/settings are allowlisted in `scripts/cloudflare-environment.ts`.
The release requires a 32-byte base64 token encryption key and a session password of at least 32 characters. Preserve
the existing environment's encryption key when moving its database. Do not substitute a new key for existing records.
WorkOS callback is `<APP_URL>/callback`; cookies remain host-only. Audit aliases and provider callback registrations
before attaching any domain. Nonproduction responses include `X-Robots-Tag: noindex, nofollow`; that is not access control.

## Release procedure

`scripts/release.ts staging check` builds web and Storybook and validates both with `cf deploy --prebuilt --dry-run`.
It requires `APP_COMMIT_SHA` (40 hexadecimal characters), `APP_URL`, `CLOUDFLARE_HYPERDRIVE_ID`,
`CLOUDFLARE_DOCUMENTS_BUCKET`, and `CLOUDFLARE_SECRETS_FILE` pointing to an ignored JSON object. Optional
`CLOUDFLARE_SETTINGS_FILE` contains only allowlisted public settings. Never put admin tokens or database credentials
in either Worker input file. Storybook is an assets-only project under `.cloudflare/stories-release`, with its commit
at `/health.json`, fixtures and MSW, and no application bindings.

Deployment adds `RELEASE_CUTOVER_READY=true`, a clean checkout matching the release commit, and the direct migration connection.
Use Neon's direct endpoint through `DIRECT_DATABASE_URL`, with public certificate and hostname verification.
One dedicated PostgreSQL session holds an advisory lock around Drizzle migrations, with a two-minute lock timeout.
The serialized release runner is the only migration owner.

GitHub's `staging` and `production` environments supply the variables above, `CLOUDFLARE_ACCOUNT_ID`,
`STORIES_URL`, optional domain lists, and `CLOUDFLARE_API_TOKEN`, `DATABASE_MIGRATION_URL`, optional `DATABASE_CA_CERT`,
`CLOUDFLARE_WORKER_SECRETS` secrets. Railway deployment credentials are no longer used.
`CLOUDFLARE_WORKER_SETTINGS` is a JSON variable.
The repository's `CLOUDFLARE_RELEASE_ENABLED` and both environments' `RELEASE_CUTOVER_READY` gates were enabled for the
qualified October 16 cutover. A new environment must pass resource, storage, callback and rollback gates before enabling them.
Each environment's deploys are serialized. Older main commits cannot replace newer staging. Web, Workflows and Storybook
are released before the queue scheduler; both HTTP health endpoints must report the expected commit. Provision the
native executor queue and DLQ first. Verify Workflow, retry, recovery and AWS delivery before retiring old services.

Both web and Storybook HTTPS origins are validated before any build, migration, or deployment. Production also requires each origin in its respective Worker custom-domain configuration.

Promotion requires an explicitly entered 40-character approved commit, compares it with staging's served SHA, and
requires a successful CI run that actually completed staging deployment. The manual dispatch is the production
approval mechanism; this private repository's current GitHub billing plan does not support required environment reviewers.
Production uses that exact commit and runs signed-out smoke checks. Full browser qualification uses isolated test
workspaces; never seed production. Passing builds and dry runs do not replace deployed qualification, data reconciliation,
or the agreed observation window. Keep the previous web artifact and storage available through that window.

## Private storage transfer and recovery

`pnpm storage:transfer scan|copy|verify .cloudflare/storage-transfer/<run>` operates on explicitly supplied
`SOURCE_S3_ENDPOINT`, `SOURCE_S3_BUCKET`, `SOURCE_S3_ACCESS_KEY_ID`, `SOURCE_S3_SECRET_ACCESS_KEY` and equivalent
`TARGET_S3_*` values. Use HTTPS except for a loopback emulator. `DIRECT_DATABASE_URL` (or `DATABASE_URL` when direct) is read through the verified direct
connection policy. Credentials, manifests, journals and temporary files stay ignored and outside browser assets.

1. Pause all document writers, including background jobs. Record the matching database recovery point.
2. `scan` inventories both stores and database references, recording keys, lengths and source ETags. Missing referenced
   source files fail the scan. Review target-only files; the tool never deletes objects or database rows.
3. `copy` reads the recorded source version, computes SHA-256, preserves content type and relevant metadata, and checks
   the destination bytes after each write. A changed source version fails instead of silently changing the manifest.
4. `verify` rehashes every source and destination file without writing. Rerunning `copy` verifies and skips identical
   objects; its journal records completed work and a partial run can safely restart.
5. Reconcile counts, total bytes, references, target-only keys and checksum results. Only then switch both web bindings
   and Node S3 settings together. Exercise authorized/unauthorized downloads before resuming writers.
6. To roll back after new writes, pause writers again, use a new run with source and target reversed, copy and verify
   the reverse delta, and reconcile database records with objects before returning traffic. Never reuse an old manifest
   for a changed source or delete the retained bucket as part of copying.

Rehearse these steps with nonproduction data. Deletions, retention and database restoration require a recorded decision;
a successful object copy alone cannot establish recovery correctness. Keep additive schema changes compatible with both
the previous compatible Cloudflare release. Database rollback uses a forward migration or a verified Neon
recovery point with matching documents, not an edited applied migration or a stale Railway copy. Confirm Neon's
actual retention and restore policy before cutover; it does not inherit Railway's backup retention.
