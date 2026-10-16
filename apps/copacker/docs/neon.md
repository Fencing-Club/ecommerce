# Neon database operations and PR previews

The TanStack Start web runtime uses Cloudflare Workers, Hyperdrive and private R2 storage. The Node job executor
remains on Railway. The database migration merged in PR 17 selects the existing Neon project `Copacker`
(`noisy-glitter-65827666`), PostgreSQL 18 in AWS Oregon (`aws-us-west-2`). Verify each live service and Hyperdrive
origin before cutover. On October 16, a read-only Cloudflare check confirmed staging Hyperdrive targets Neon with
`verify-full`, caching disabled and five origin connections. The earlier application qualification ran against Railway;
repeat deployed acceptance against the new origin before release.

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
Disable the old Railway web pre-deploy step before enabling this runner. Production promotion releases the exact
tested staging commit. See the [release gates](cloudflare.md#release-procedure); tests never seed production.

## PR previews

After the regular CI checks pass, trusted same-repository PRs receive a private Neon branch cloned from staging.
CI applies that PR's migrations through the direct connection. Subsequent pushes reuse the branch and preserve its
test edits. Forks and Dependabot do not receive credentials. With `CLOUDFLARE_PREVIEW_CONFIG` configured, CI builds
the Cloudflare app Worker and uploads fixture-only Storybook files, verifies their commit health endpoints, and links both in
the Actions summary. Each app gets its own Hyperdrive connection and queue. Previews reuse the existing private
`copacker-staging-private` R2 bucket, with `previews/pr-<number>/` reserved for each PR. Referenced staging files are copied
into that PR's `app/` folder in the same bucket and verified by SHA-256; missing source files fail deployment. Further
pushes preserve the preview's edits. No new bucket or Railway resource is created.

Storybook is served at `https://previews.copacker.ai/pr-<number>/storybook/` by one shared Worker. Its files live under `previews/pr-<number>/storybook/<build-version>/`. Publication changes only after every upload succeeds. The server checks the publication marker before serving cached files, so cleanup makes even cached URLs unavailable. The private bucket is never made public, and the server cannot route requests to app documents. The app itself retains its isolated workers.dev origin for routing and authentication; the `app/` bucket folder contains documents, not executable server code.

The storage adapter prefixes every preview read, write and delete. These folders separate normal app operations,
not bucket permissions: trusted preview code has the same bucket access as staging. The shared bucket holds only
test data; production files stay in a separate bucket.

Preview secrets contain only the staging WorkOS credentials, a session password, and the staging encryption key.
Do not provide production or commerce API credentials. Background jobs remain pending in the isolated preview
database/queue: the retained staging and production executors never consume them. Hosted previews cover web,
authentication, database mutations and documents; full job execution needs the separate Cloudflare executor migration.

The close workflow runs trusted default-branch code on **both merge and close**. It stops the app and unpublishes Storybook,
removes the PR's queue and Hyperdrive, deletes only its R2 prefix, and finally removes the Neon branch. It verifies
absence before reporting success. A partial failure fails the job and can be retried safely; the database remains
until Cloudflare cleanup succeeds. The shared assets Worker and bucket, staging and production are preserved.

A six-hour sweep inventories Neon, Workers, Hyperdrive, queues **and R2 files independently**, so an expired Neon
branch or interrupted deployment cannot hide leftover hosting. It removes only PRs GitHub explicitly reports closed;
unknown/inaccessible or reopened PRs are preserved. One PR's failure does not prevent attempts on the others.
Deployments recheck PR state and commit before provisioning and PR state after deployment. All lifecycle jobs share
a concurrency group. The scheduled sweep also recovers events displaced from GitHub's pending concurrency slot.
Cleanup can be dispatched with a closed PR number. Branches expire seven days after provisioning; a later push
removes old hosting/files before recreating the database from current staging.

Required repository configuration:

| Kind | Names |
| --- | --- |
| Secrets | `NEON_API_KEY` (project-scoped), `CLOUDFLARE_PREVIEW_TOKEN`, `CLOUDFLARE_PREVIEW_SECRETS` |
| Variables | `NEON_PROJECT_ID`, `NEON_STAGING_BRANCH_ID`, `NEON_DATABASE_NAME`, `NEON_ROLE_NAME`, `CLOUDFLARE_PREVIEW_CONFIG` |

`CLOUDFLARE_PREVIEW_CONFIG` is a JSON object with `accountId`, `bucket` (`copacker-staging-private`),
`subdomain` (the account's workers.dev subdomain), and `caCertificateId` (the uploaded Neon public root CA).
CI reuses the existing staging bucket and never deletes it. The scoped account token
needs Workers Scripts Write, Hyperdrive Write, Queues Write, and Workers R2 Storage Write. Deploying the shared assets Worker with its custom domain also requires the corresponding Workers domain/zone permissions. The secrets JSON contains
exactly `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, and `TOKEN_ENCRYPTION_KEY`.
Register the test WorkOS callback/sign-out patterns listed in [domains](domains.md#pull-request-previews).

Deploy and verify the shared assets Worker with `pnpm --filter copacker preview:assets:deploy` before enabling hosted previews. Its dedicated workflow maintains it after changes on main.

Enable the configuration only after this cleanup implementation is on the default branch and staging's R2 files
match its database references. Until then, existing database-only previews continue; do not claim hosted previews
are active from a build or dry run alone.

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
