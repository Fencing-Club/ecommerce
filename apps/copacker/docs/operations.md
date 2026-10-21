# Run Copacker

Install the monorepo first ([Setup](../../../docs/setup.md)). Copy `apps/copacker/.env.example` to `apps/copacker/.env` and fill it in. `TOKEN_ENCRYPTION_KEY` is 32 random bytes
encoded as base64; `WORKOS_COOKIE_PASSWORD` is at least 32 random characters. Never commit environment files.

Run `pnpm --filter copacker db:up` and `pnpm --filter copacker db:migrate` before starting the web app, and
`pnpm --filter copacker worker:dev` in a second process. Set up [Portless](development.md) before `pnpm dev`.
The [domain inventory](domains.md) lists every environment address and provider setting.
Postgres owns durable job state. Hosted jobs execute through Cloudflare Queues and Workflows; the Node worker is
for local development only. See [background jobs](background-jobs.md) for dispatch, checkpoints and recovery.
The web service exposes `/api/health`.

## External setup

1. WorkOS: an AuthKit application, set up as in [WorkOS settings](auth.md#workos-settings). Copacker draws its own
   sign-in pages against the WorkOS API; its database owns workspace memberships and per-order sharing.
2. Shopify: a public-distribution app with `<APP_URL>/api/connections/shopify` as its redirect and the scopes in
   `apps/copacker/shopify.app.toml`. Product details copied from Shopify metafields are in
   [Variation and product details](api-contract.md#variation-and-product-details).
3. Amazon: a public SP-API application with the AWD role and Listings access, redirecting to
   `<APP_URL>/api/connections/amazon`. Amazon requires an HTTPS redirect, so test it on a deployed environment. While the
   public app is a draft, set `AMAZON_APP_DRAFT=true`: the consent link asks for `version=beta` and still uses Amazon
   sign-in. Settings first asks for the US, Canada, Mexico or Brazil marketplace, then opens its Seller Central consent
   page. The callback receives the seller ID and exchanges the authorization code for a token, encrypted per workspace.
   The connected Amazon card lists the supported marketplaces returned by Amazon's seller account API, visible to
   members as well as admins. If that lookup fails, the card says the marketplace list could not be loaded; it does not
   infer marketplace access from the country selected during sign-in.
   Marketplace choice controls the sign-in site; syncing remains North American, with US FBA/AWD inventory and inbound shipments.
   Private apps cannot use this public-app OAuth flow. Configure Copacker's public app and register the exact callback
   URL in Amazon's Solution Provider Portal. See [Amazon's website authorization workflow](https://developer-docs.amazon/sp-api/lang-US/docs/website-authorization-workflow).
4. Email (Resend): `EMAIL_API_KEY` (sending only) and `EMAIL_FROM`. The worker sends invitations, POs and label-ready
   notices, and the app sends password resets, all from `packages/copacker-emails`; their header mark loads from
   `APP_URL` (`public/email/mark.png`). Resend only sends: the landing page's waitlist is WorkOS's
   ([Landing page](landing-page.md)). The contact page's messages and a notice of each new waitlist signup go to
   `CONTACT_EMAIL`. `copacker.ai` is verified in Resend for sending only (us-east-1, no open or click tracking). Its DKIM (`resend._domainkey`), return
   path (`send`, `rsend`) and DMARC (`_dmarc`, `p=none`) records are DNS-only in Cloudflare; none sit at the root, which
   stays free for a mail provider. Production's `EMAIL_FROM` is `Copacker <hello@copacker.ai>`, shared by web and Workflow execution. Local
   and staging keep `onboarding@resend.dev`, which reaches only the Resend account's owner, so their tests can't email
   anyone else: staging's end-to-end runs invite `@example.net` addresses, which would bounce from the real domain.
   Nothing receives `@copacker.ai` mail. Invitations, purchase orders, label notices and password resets set no
   reply-to, so replies to them go to `hello@copacker.ai` and bounce.
5. Storage: native private R2 bindings for web requests and Workflow steps. The [verified storage cutover](cloudflare.md#private-storage-transfer-and-recovery) preserved the original objects. Objects
   are read only through server-authorized routes.
6. Privacy policy and terms: developer programs and app listings ask for `<APP_URL>/privacy` and `<APP_URL>/terms`
   ([Landing page](landing-page.md)).
7. Amazon Ads: a separate approved Login with Amazon profile, with `AMAZON_ADS_CLIENT_ID` and
   `AMAZON_ADS_CLIENT_SECRET` in the application Worker, including its Workflow entrypoint. Register
   `<APP_URL>/api/connections/amazon-ads` as an allowed return URL, then connect Ads from Amazon's settings sheet.
   See [Amazon Ads expenses](amazon-ads.md) for reporting coverage and the expense calculation.

## Recovery

Lost Amazon creates, cancellations and retries are in
[Amazon inbound shipments](amazon-inbound.md#failures-and-cancellation).

Failed notification and Shopify write jobs stay visible for an owner to retry once the configuration is fixed. Shopify
cost updates need matching currencies and use the supplier's piece price times the sellable pack size, with no estimated
exchange rate or hidden freight.

## Maintenance

To take Copacker down, set the `maintenance` feature flag to **All** in that environment's WorkOS dashboard (Feature
flags). Within about 10 seconds every page behind sign-in, signing in included, shows the maintenance page at its own
address with a 503 and `Retry-After`, and the API and server actions answer 503 with a message. The marketing site
(home for visitors, contact, privacy, terms, unsubscribe), its forms and `/api/health` stay up. Set the flag back to
**None** and open maintenance pages reload into the page they stand in for.

- The flag is created once, in the dashboard (Create feature flag, slug `maintenance`). WorkOS creates flags in every
  environment, each with its own setting. **Some** takes no one down: Copacker reads the flag for everyone at once.
- The page skips sign-in and the database, so it works while Postgres is down. The flag lookup uses WorkOS's public
  feature-flag API with a two-second deadline and a ten-second cache. No background poller runs in the web process.
  If WorkOS cannot be reached on a cold process, Copacker stays up; after a successful read it retains that setting
  during an outage and retries on the next request after ten seconds. A deleted flag means maintenance is off.
- `/maintenance` is a 404 while Copacker is up. Background work continues. Use Cloudflare queue delivery controls
  and pause active Workflow instances when maintenance requires jobs to be idle; also pause scheduled publications.
- The rules are in `src/server/maintenance.ts`. `src/server.ts` and `server/start-maintenance.ts` establish the
  invocation context before authentication; Router rewriting renders the maintenance screen at the requested URL.
  The page and API status policy is shared with the deployed compatibility proof.

## Releases

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request. A `changes` job first works out
whether the change affects Copacker (`.github/scripts/affected.mjs`): code in `apps/copacker` or a workspace package
it uses, or anything every app shares, such as the workflows, the lockfile or the root configs. Docs, Markdown and
design files don't count. A pull request is compared with its target branch, and a push with the commit staging serves.
Then, side by side:

- `verify`: format, lint, types, unused code (`check:unused`) and the other packages' tests, always.
- `unit`: Copacker's unit tests, in three shards, when Copacker is affected. `unit-coverage` merges the shards' results
  and coverage into one report.
- `worker`: Copacker's build, the built-Worker webhook and job regressions and every migration on an empty Postgres 18,
  when Copacker is affected.
- `stories`: the Storybook tests, in four shards, when Copacker is affected.
- `e2e`: the [end-to-end suite](e2e.md), in two shards, when Copacker is affected.

Turbo replays tasks whose inputs have not changed. `ci-ok` is the required aggregate check. The Cloudflare release
workflow is gated by `CLOUDFLARE_RELEASE_ENABLED` and the environment's `RELEASE_CUTOVER_READY`. These gates are enabled
following storage, callback, database and rollback qualification. Production promotion is a manual dispatch of an exact
tested staging commit; GitHub required reviewers are not configured.

The [Cloudflare release guide](cloudflare.md#release-procedure) describes exact-commit promotion, scoped secrets,
static Storybook, Cloudflare Workflows, serialized migrations and deployed health checks. Railway is no longer a release
target. See the [cutover acceptance record](specs/platform-migration/acceptance.md) for deployment and retirement status.

During prelaunch, breaking schema changes ship with coordinated releases; stop incompatible executors before applying
them. Do not retain obsolete fields for older releases. A rollback requires compatible code or a matching database
recovery point and private documents. See [database recovery](neon.md#transfer-and-acceptance).

## Infrastructure

Cloudflare owns the web target, static assets, private R2 storage, wake queues and scheduled recovery. Neon owns the
authoritative Postgres databases. Cloudflare Workflows executes long jobs; native Queues handles bounded jobs and scheduled AWS reads.
The [acceptance record](specs/platform-migration/acceptance.md) records activation and any rollback of the web target.

| Environment | Application Worker | Storybook Worker | Private R2 bucket | Database |
| --- | --- | --- | --- | --- |
| Staging | `copacker-staging` | `copacker-stories-staging` | `copacker-staging-private` | Neon staging through its own Hyperdrive |
| Production | `copacker` | `copacker-stories` | `copacker-production-private` | Neon production through its own Hyperdrive |

Historical Railway project `copacker` (`d8195bc8-1e6d-4fd6-b7bc-8ecf9852acd6`): all web, worker and Storybook
deployments are offline. Project deletion is accepted, with final removal scheduled for October 19, 2026 at 23:16 UTC.

| Resource                | ID                                     |
| ----------------------- | -------------------------------------- |
| Production environment  | `3fdd8f47-c9ad-44c5-b554-78b64818b4e5` |
| Staging environment     | `b822ecad-68dd-4f4f-89e0-d9db00485545` |
| Previous web (`copacker`) | `79da7d29-d1d6-4aa7-9fef-709dbf2b9619` |
| Worker (`copacker-worker`) | `08c1edb8-c309-4fe4-b71e-14b54065a0fc` |
| Previous documents bucket | `868f3e53-a9fe-4b2b-9eeb-e69926c2b1d2` |

Each environment has its own Worker, executor, private bucket and independent [Neon database branch](neon.md).
Production's canonical origin is `https://copacker.ai`; staging's is `https://staging.copacker.ai`.
The previous Railway aliases no longer serve running deployments. Both environments sign in through WorkOS's staging
environment ([WorkOS settings](auth.md#workos-settings)).

`copacker.ai` is registered with Cloudflare Registrar and uses Cloudflare DNS. Worker custom domains manage the
application and Storybook DNS/TLS after handoff; `www` redirects to the root. Retain old Railway verification records
until the retired resources and provider aliases are removed. The landing film is in the `copacker-media` R2 bucket, served from
`media.copacker.ai` ([Landing page](landing-page.md#assets)).

Staging was duplicated from production. It has its own `TOKEN_ENCRYPTION_KEY` and `WORKOS_COOKIE_PASSWORD`, and uses
the development apps (Copacker Dev, Aisle Dev), so connecting a store there never rotates production's tokens. Its
worker reads its own SQS queues (`copacker-*-staging`) as IAM user `copacker-worker-staging`. To fill it with the demo
store, explicitly set `DEPLOYMENT_ENV=staging` and staging database credentials for the seed command. Never seed production.

## Databases and migrations

Local development uses its own Postgres 18 in Docker (`db:up`), at
`postgres://copacker:copacker@127.0.0.1:54329/copacker`. Run the worker locally too; jobs queued locally never reach a
deployed worker. Local data starts empty: sign in, create a workspace and connect accounts, or run
`pnpm --filter copacker db:seed` for a demo store with bundles, a Collective location, an Amazon location and a sent PO
(it skips workspaces connected to a real store). Never point local development at a deployed database or copy its
connection tokens: Shopify rotates refresh tokens, so a local refresh would disconnect the deployed store.

Local Shopify connects through "Copacker Dev" in the Shopify Dev Dashboard (client ID
`d7bad24713b6495c6f6e43d18f143eec`, legacy install flow, not embedded), which staging uses too; it allows localhost's
and staging's redirects. Keep its scopes the same as production's app. Until Shopify approves `read_all_orders` for it,
order syncs through it copy the last 60 days. Local Amazon connects by self-authorization through Aisle Dev; production
uses Aisle. Put each dev app's client ID and secret (and Aisle Dev's application ID) in the local `.env`. Local
`APP_URL` and `WORKOS_REDIRECT_URI` are supplied by the Portless launcher for each worktree.
Register its exact commerce callbacks as described in the [domain inventory](domains.md). Webhooks, notifications and queues per
environment are in [Shopify webhooks and Amazon notifications](notifications.md).

**Production data survives releases.** Keep applied SQL migrations and their journal entries immutable; append new
migrations rather than replacing deployed history with a fresh baseline. `db:migrate` applies only pending migrations
to existing databases and builds the full schema on empty databases. Never clear migration bookkeeping or reset a
database during deployment. Preview branches inherit staging's history and follow the same incremental path.

The compatibility cleanup adds customer-coverage tracking without deleting orders, connections, supplier terms or
stored sync metadata. Numeric sync versions no longer drive runtime behavior. Removing unused stored fields is a
separate data-retention decision, not a prerequisite for simplifying the application. Resets of disposable local,
preview or staging data require explicit authorization; production must be upgraded in place with a verified backup.

Migration `0059_customer_coverage` refuses to proceed if stored Shopify orders or stock snapshots lack fields now
required by the runtime. Refresh those records using the previous release and retry; do not fabricate prices or delete
orders to get past the check. The failure rolls back the migration and the release stops before deploying new code.
If a provider can no longer supply the missing history, retain the existing release until a preservation plan is reviewed.
Customer coverage starts unconfirmed so the next permitted sync verifies the complete history without deleting orders.

Migration `0060_validate_shopify_payments` also checks each stored Shopify payment and its fee amounts against the
current contract. Invalid payment data stops deployment without changing records; use the same refresh-and-retry
process. This is a separate migration because `0059_customer_coverage` has already run in preview environments.

Migration `0061_validate_shopify_line_money` extends that read-only check to line prices and every nested discount
allocation. Amounts must be decimal strings and currency codes must be three-character strings. It leaves both
previously deployed migrations unchanged and blocks deployment on invalid data without rewriting or deleting records.

Schema changes: edit `src/db/schema.ts`, run `pnpm --filter copacker db:generate`, and commit the SQL and metadata under
`drizzle/`. Custom SQL functions are maintained in migrations because Drizzle's schema snapshots do not describe them;
copy a changed one into `tests/database-schema.ts` too. Tests never run, replay, hash or inspect migrations: suites
that do grow without bound and slow every run. The unit project's global setup builds the schema's SQL from
`src/db/schema.ts` once per run, and each database test creates it with `applySchema` (`tests/database.ts`). The one
exception is CI's `worker` job, which applies every migration to an empty Postgres once per run as a release gate;
don't add to it.
The serialized release runner applies migrations through a direct connection with an advisory lock; keep one migration owner.

`pnpm --filter copacker db:drift` compares a live database (`DATABASE_URL`, with `DATABASE_CA_CERT` when TLS needs it)
with a freshly migrated one (`REFERENCE_DATABASE_URL`, such as the local database after `db:migrate`), read-only on both.
Read deployed databases through direct Neon connections with `sslmode=verify-full`. Keep credentials in runtime
environment variables or secret stores; never replace a local development URL with a deployed database URL.
See [Neon connections and releases](neon.md).

### Amazon connection mode

`AMAZON_SELF_AUTH_ENABLED` defaults to `true`. Settings retains the marketplace selector and adds a refresh-token field for private self-authorization, validates access with Amazon, and stores the token encrypted. The seller ID is configured server-side in `AMAZON_MERCHANT_TOKEN`; customers never enter it. The token must belong to the configured `AMAZON_CLIENT_ID` and `AMAZON_CLIENT_SECRET`. Set the flag to `false` to show the marketplace selector and launch the existing Seller Central OAuth flow. Manual-token submissions are also rejected server-side when disabled. This flag does not change existing connections.

## Preview scope

Trusted PRs receive isolated Neon staging copies with their migrations applied after the Storybook build. Configured Cloudflare
previews deploy the app and static Storybook, use a private R2 prefix per PR, and remove their hosting, database
connection, queue, files and Neon branch on merge/close. A six-hour sweep retries incomplete cleanup, including
Cloudflare resources whose Neon branch already expired. No new Railway resources are provisioned.
See [Neon PR previews](neon.md) for activation, scope, credentials, expiry, and cleanup.
