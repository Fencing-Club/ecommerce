# Neon database operations and PR previews

The TanStack Start web runtime uses Cloudflare Workers, Hyperdrive and private R2 storage. The Node job executor
remains on Railway. The database migration merged in PR 17 selects the existing Neon project `Copacker`
(`noisy-glitter-65827666`), PostgreSQL 18 in AWS Oregon (`aws-us-west-2`). Read-only Cloudflare checks confirmed both
environments' Hyperdrive configurations target Neon with `verify-full`, caching disabled and five origin connections.
The web cutover was qualified against Neon; see the [acceptance record](specs/platform-migration/acceptance.md).

| Environment | Neon branch | Railway environment |
| --- | --- | --- |
| Production | `production` (`br-small-fire-ar4lfkps`) | `production` |
| Staging | `staging` (`br-quiet-shape-ar6l2pe6`) | `staging` |
| Pull request | `pr-<number>`, copied from staging | None |
| Local development | Local Docker Postgres | None |

## Connections and releases

Set `DATABASE_URL` to the pooled Neon connection on the Node worker. Point each web environment's Hyperdrive at its
direct Neon endpoint with query caching disabled and verified TLS. The protected release environment's
`DATABASE_MIGRATION_URL` secret supplies `DIRECT_DATABASE_URL` to the serialized migration runner. Both Node URLs use `sslmode=verify-full`.
The runtime verifies Neon's public certificate and does not reuse a Railway CA. Never disable TLS verification.
Migrations reject a Neon pooler endpoint. Local Docker can leave `DIRECT_DATABASE_URL` unset.

Keep the existing `TOKEN_ENCRYPTION_KEY`, WorkOS configuration, commerce app credentials, queues, and bucket settings
with each environment. Moving encrypted database records does not rotate their encryption key or store authorizations.
Staging and production remain independent; never reset staging from production.

CI continues to validate migrations on an empty local Postgres 18. The gated Cloudflare release workflow migrates
through one dedicated session with an advisory lock before deploying web, Storybook, the retained worker and scheduler.
The old Railway web pre-deploy steps are disabled. Production promotion releases the exact
tested staging commit. See the [release gates](cloudflare.md#release-procedure); tests never seed production.

## PR previews

### Provisioning performance

Preview commands report each provisioning phase as structured timing events. CI also uploads the aggregate
`preview-timings` artifact and writes a phase table to the job summary, including document and Storybook file counts
and bytes. Reports exclude credentials, file names and copied contents. The measured command total excludes waiting
for earlier CI checks and runner setup; compare those separately using the workflow's job timestamps.

Documents stream through one S3 client per source/destination, in batches of four, without launching a CLI for each
object or listing the whole bucket. The existing SDK reuses connections and retries transient failures. Each copy
downloads its source, uploads to its PR prefix, reads it back and compares SHA-256, length and content type before
the ready marker can be written. Batches drain on failure before scratch files and clients are removed. Later pushes
check the marker directly and preserve preview edits.

The `cf` CLI verifies the existing account API token and issues temporary credentials lasting 30 minutes. Source
credentials allow only reads of the database's exact reference keys; destination credentials allow reads/writes
only inside this PR's document prefix. They stay in memory, are never added to artifacts/logs, and require no new
long-lived secret. See [R2 temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/).

Storybook uses Workers Static Assets on a separate Worker per PR. The CLI batches missing content hashes and reuses
unchanged assets on updates, replacing one CLI process per R2 object. Deployment validates the artifact before
publishing its complete manifest. File and byte counts describe the source build, not only uploaded differences.

CI builds Storybook once from the exact source commit alongside the verification jobs. It uploads a fixture-only
artifact with commit metadata and a SHA-256 manifest. The preview downloads that artifact from the same workflow
run and verifies both identity and content before deploying. There is no second Storybook build inside provisioning.
Local provisioning likewise requires `build-storybook` followed by `storybook:seal` with `APP_COMMIT_SHA` matching HEAD.

Preview app builds use Turbo's signed cache through `build:preview`. Its key includes the commit, PR number, app
origin, Hyperdrive, bucket, account, authentication settings and Vite variables. Staging and preview builds use
separate tasks. The Worker regression still runs on the exact resulting artifact, including cache hits.

Compare fresh previews only with other fresh previews and compare repeated pushes separately. Record counts, bytes,
commit, workflow URL and whether documents were reused. The [performance qualification in PR 28](https://github.com/AndrewCraswell/ecommerce/pull/28) records hosted before/after measurements and functional checks.

Previews start after the shared Storybook build while verification, story tests and end-to-end tests continue.
Availability is not a successful CI result: `ci-ok` and staging promotion still require every applicable check.
Different PRs may provision concurrently. A maintained small fixture baseline remains a separate opportunity.

### Isolation and lifecycle

Alongside the regular CI checks, trusted same-repository PRs receive a private Neon branch cloned from staging.
CI applies that PR's migrations through the direct connection. Subsequent pushes reuse the branch and preserve its
test edits. Forks and Dependabot do not receive credentials. With `CLOUDFLARE_PREVIEW_CONFIG` configured, CI builds
the Cloudflare app Worker and uploads fixture-only Storybook files, verifies their commit health endpoints, and links both in
the Actions summary. Each app gets its own Hyperdrive connection and queue. Previews reuse the existing private
`copacker-staging-private` R2 bucket, with `previews/pr-<number>/` reserved for each PR. Referenced staging files are copied
into that PR's `app/` folder in the same bucket and verified by SHA-256; missing source files fail deployment. Further
pushes preserve the preview's edits. No new bucket or Railway resource is created.

Storybook is served at `https://copacker-stories-pr-<number>.<subdomain>.workers.dev/` by an assets-only Worker.
It has no R2, database or secret bindings. Only the fixture build is published; unknown paths return 404, and
`health.json` reports the deployed commit without caching. Closing the PR deletes the Storybook Worker along with
the app Worker. The private bucket is never made public. The app retains its isolated workers.dev origin for routing
and authentication; the `app/` bucket folder contains documents, not executable server code.

The storage adapter prefixes every preview read, write and delete. These folders separate normal app operations,
not bucket permissions: trusted preview code has the same bucket access as staging. The shared bucket holds only
test data; production files stay in a separate bucket.

Preview secrets contain only the staging WorkOS credentials, a session password, and the staging encryption key.
Do not provide production or commerce API credentials. Background jobs remain pending in the isolated preview
database/queue: the retained staging and production executors never consume them. Hosted previews cover web,
authentication, database mutations and documents; full job execution needs the separate Cloudflare executor migration.

The close workflow runs trusted default-branch code on **both merge and close**. It deletes both preview Workers,
removes the PR's queue and Hyperdrive, deletes only its R2 prefix, and finally removes the Neon branch. It verifies
absence before reporting success. A partial failure fails the job and can be retried safely; the database remains
until Cloudflare cleanup succeeds. The shared bucket, staging and production are preserved.

A six-hour sweep inventories Neon, Workers, Hyperdrive, queues **and R2 files independently**, so an expired Neon
branch or interrupted deployment cannot hide leftover hosting. It removes only PRs GitHub explicitly reports closed;
unknown/inaccessible or reopened PRs are preserved. Discovery is read-only and emits a matrix of confirmed closed
PRs. Each removal acquires the same `copacker-preview-<number>` concurrency group as that PR's deployment, then
re-reads the PR and provider state. A reopened PR is preserved even if discovery found it closed. Partial discovery
failures still allow independently confirmed candidates to be removed; removal jobs do not fail fast.
Deployments recheck PR state and commit before provisioning and PR state after deployment. Lifecycle groups queue
pending jobs (`queue: max`) and never cancel active mutations. Superseded verification jobs can still be cancelled.
Ordinary provisioning does not inventory unrelated PR files; cleanup lists its own prefix after stopping writers.
Cleanup can be dispatched with a closed PR number. Branches expire seven days after provisioning; a later push
removes old hosting/files before recreating the database from current staging.

Required repository configuration:

| Kind | Names |
| --- | --- |
| Secrets | `NEON_API_KEY` (project-scoped), `CLOUDFLARE_PREVIEW_TOKEN`, `CLOUDFLARE_PREVIEW_SECRETS` |
| Variables | `NEON_PROJECT_ID`, `NEON_STAGING_BRANCH_ID`, `NEON_DATABASE_NAME`, `NEON_ROLE_NAME`, `CLOUDFLARE_PREVIEW_CONFIG` |

`CLOUDFLARE_PREVIEW_CONFIG` is a JSON object with `accountId`, `bucket` (`copacker-staging-private`),
`subdomain` (the account's workers.dev subdomain), and `caCertificateId` (the uploaded Neon public root CA).
CI reuses the existing staging bucket and never deletes it. The user API token scoped to this account
needs Workers Scripts Write, Hyperdrive Write, Queues Write, and Workers R2 Storage Write. The secrets JSON contains
exactly `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, and `TOKEN_ENCRYPTION_KEY`.
Register the test WorkOS callback/sign-out patterns listed in [domains](domains.md#pull-request-previews).

Hosted previews are enabled and verified; see [cutover acceptance](specs/platform-migration/acceptance.md).
When recreating this setup, enable it only after cleanup is on the default branch and staging's R2 files match its
database references. A successful build or dry run alone is not proof of a working hosted preview.

## Transfer and acceptance

Rehearse on a temporary Neon branch before cutting over either environment. Use Postgres 18 dump/restore tools and
direct endpoints. Restore schema, data, sequences, SQL functions, and the `drizzle` migration ledger with
`--no-owner --no-acl --exit-on-error`. Do not replay historical migrations over an already-restored schema.

For each final copy, pause CI deployments and all source writers, including the web service and worker. Wait for
in-flight database transactions and jobs to finish, then export. Queue messages must remain queued while consumers
are stopped. Restore only into an empty target, run `scripts/database-audit.sql` on both sides, and compare the
table counts, row digests, function definitions, and sequence state. Compare schema with `db:drift`, then run the
migration runner against the direct target connection. Update both services before resuming either.

Run the full staging E2E suite and production's read-only smoke suite. Confirm encrypted connections can still be
read and worker jobs advance. Retain the final exports securely outside the repository. Remove the Railway databases
only after the merged release is serving successfully from Neon and no service references their URLs.

Once Neon accepts writes, switching back to an old Railway copy loses newer changes. Recovery requires restoring
Neon history or transferring the newer data; it is not a connection-string rollback. Check the project's actual
restore window and backups in Neon before retiring the old recovery system. The initial project had six hours of
history; do not assume it has the old Railway daily/weekly retention. The [Cloudflare job delivery](background-jobs.md)
worker queries Postgres on work signals rather than continuously while idle. Verify actual compute usage after cutover;
active jobs, hourly recovery and user traffic still consume compute.

## Agent setup

The Neon plugin supplies the `neon`, `neon-postgres`, and `neon-postgres-branches` skills and the Neon MCP server.
Do not install duplicate MCP entries or credentials into repository configuration. The CLI is also supported.
Use `neon link --project-id noisy-glitter-65827666 --branch <isolated-branch> --no-env-pull -y`; `.neon` is ignored.
Keep local Docker environment files intact. The current skill is available at
[Neon's skill endpoint](https://neon.com/.well-known/agent-skills/neon/SKILL.md).
