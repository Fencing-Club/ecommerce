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
test edits. Forks and Dependabot do not receive credentials. The Actions summary identifies the database branch;
it does not link to a running application. Copied integration records remain encrypted; the job receives no
decryption key, commerce credentials, storage credentials, or background worker configuration.

Hosted app previews remain a separate follow-up after the Cloudflare web release. This migration does not create Railway
preview services or buckets. New app and storage resources belong in Cloudflare; preview documents will use a private
R2 bucket with a separate prefix per PR when hosted previews are implemented.

The close workflow runs trusted default-branch code to remove the Neon branch. Branches expire seven days after
the latest successful provisioning attempt. A six-hour sweep removes branches for PRs GitHub explicitly reports as
closed. Pushing after expiration recreates the branch from current staging. All preview provisioning and cleanup
runs serialize to avoid deletion races. Cleanup can also be dispatched with a PR number.

Required repository configuration:

| Kind | Names |
| --- | --- |
| Secrets | `NEON_API_KEY` (project-scoped) |
| Variables | `NEON_PROJECT_ID`, `NEON_STAGING_BRANCH_ID`, `NEON_DATABASE_NAME`, `NEON_ROLE_NAME` |

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
