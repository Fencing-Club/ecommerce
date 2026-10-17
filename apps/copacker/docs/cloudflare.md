# Cloudflare runtime and releases

Copacker's TanStack Start application is deployed to Cloudflare Workers on staging. Production web is temporarily
back on its retained Railway artifact after the first cutover exposed an eBay forwarding failure. Storybook is live
on Cloudflare in both environments. It integrates the separately completed
[Neon database migration](neon.md). The retained Railway Node worker remains the only background executor;
[Cloudflare Queues and Cron](background-jobs.md) deliver wake signals and scheduled reconciliation. Workflows and
Cloudflare job execution remain a later milestone. The existing public hostnames are retained; the previous Railway
origins remain available for rollback. See [cutover acceptance](specs/platform-migration/acceptance.md).

## Request boundaries

`src/routes` owns the typed route tree. Presentational pages in `src/app` receive explicit loader data. Server functions
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

| Environment | Web | Database | Files |
| --- | --- | --- | --- |
| Development | Vite and local workerd, exact Portless origin | Local PostgreSQL | `.cloudflare/state/development/v3/r2` |
| Browser tests | Separate `e2e/runtime/.cloudflare/output/v0` build | Dedicated local/CI test database | `.cloudflare/state/e2e/v3/r2` |
| Staging | `copacker-staging`, no indexing | Staging Hyperdrive, caching off | Private `copacker-staging-private` |
| PR preview | `copacker-pr-<number>`, no indexing | Own Hyperdrive and Neon branch | `previews/pr-<number>/app/` folder in `copacker-staging-private` |
| Production | `copacker`, explicit custom domains | Explicit production Hyperdrive | Explicit private production bucket |

`worker:dev` uses the running web emulator's local S3 endpoint to read and write the development bucket. One emulator
owns its storage. Local credentials live in ignored `.cloudflare/storage-credentials.json`. At the coordinated storage
cutover, configure the deployed Node worker with environment-scoped R2 S3 credentials for the exact bucket bound to
the web Worker. It retains direct PostgreSQL access. Never point a local job worker at staging provider queues.

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
For retained Railway database recovery access, `DATABASE_CA_CERT` is required over the public proxy and
`DATABASE_TLS_SERVER_NAME` names the certificate's identity when it differs from the proxy. Verification is never disabled. One dedicated PostgreSQL session
holds an advisory lock around Drizzle migrations, with a two-minute lock timeout. Disable the old Railway web
predeploy migration command before enabling the new release workflow.

GitHub's `staging` and `production` environments supply the variables above, `CLOUDFLARE_ACCOUNT_ID`,
`STORIES_URL`, optional domain lists, and `CLOUDFLARE_API_TOKEN`, `DATABASE_MIGRATION_URL`, optional `DATABASE_CA_CERT`,
`CLOUDFLARE_WORKER_SECRETS` secrets. The retained executor uses the existing repository secrets
`RAILWAY_STAGING_TOKEN` or `RAILWAY_PRODUCTION_TOKEN` for its selected environment.
`CLOUDFLARE_WORKER_SETTINGS` is a JSON variable.
The repository's `CLOUDFLARE_RELEASE_ENABLED` and both environments' `RELEASE_CUTOVER_READY` gates were enabled for the
qualified October 16 cutover. A new environment must pass resource, storage, callback and rollback gates before enabling them.
Each environment's deploys are serialized. Older main commits cannot replace newer staging. The retained worker is
released after the web and Storybook, followed by its queue scheduler; both HTTP health endpoints must report the expected commit.
Provision the environment's `copacker-jobs-<environment>` queue and HTTP consumer before release. Verify wake,
retry and recovery delivery before switching traffic. The Worker uses a native binding; only the Node executor
receives the queue HTTP token.

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

1. Pause all document writers, including the retained worker. Record the matching database recovery point.
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
the previous web release and the retained worker. Database rollback uses a forward migration or a verified Neon
recovery point with matching documents, not an edited applied migration or a stale Railway copy. Confirm Neon's
actual retention and restore policy before cutover; it does not inherit Railway's backup retention.
