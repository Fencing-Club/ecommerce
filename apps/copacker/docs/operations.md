# Run Copacker

Install the monorepo first ([Setup](../../../docs/setup.md)). Copy `apps/copacker/.env.example` to `apps/copacker/.env` and fill it in. `TOKEN_ENCRYPTION_KEY` is 32 random bytes
encoded as base64; `WORKOS_COOKIE_PASSWORD` is at least 32 random characters. Never commit environment files.

Run `pnpm --filter copacker db:up` and `pnpm --filter copacker db:migrate` before starting the web app, and
`pnpm --filter copacker worker:dev` in a second process. Set up [Portless](development.md) before `pnpm dev`.
The [domain inventory](domains.md) lists every environment address and provider setting.
The worker runs the durable jobs queued in Postgres. Staging and
production run it as a second Railway service built from `Dockerfile.worker`, which runs the
worker's TypeScript through tsx. Only the web service has the HTTP healthcheck (`/api/health`).

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
   stays free for a mail provider. Production's `EMAIL_FROM` is `Copacker <hello@copacker.ai>`, on both services. Local
   and staging keep `onboarding@resend.dev`, which reaches only the Resend account's owner, so their tests can't email
   anyone else: staging's end-to-end runs invite `@example.net` addresses, which would bounce from the real domain.
   Nothing receives `@copacker.ai` mail. Invitations, purchase orders, label notices and password resets set no
   reply-to, so replies to them go to `hello@copacker.ai` and bounce.
5. Storage: a private R2 binding for the web and matching R2 `S3_*` settings for the retained worker. Existing Railway
   files move only after the verified [storage cutover](cloudflare.md#private-storage-transfer-and-recovery). Objects
   are read only through server-authorized routes.
6. Privacy policy and terms: developer programs and app listings ask for `<APP_URL>/privacy` and `<APP_URL>/terms`
   ([Landing page](landing-page.md)).
7. Amazon Ads: a separate approved Login with Amazon profile, with `AMAZON_ADS_CLIENT_ID` and
   `AMAZON_ADS_CLIENT_SECRET` on both the web and worker services. Register
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
- `/maintenance` is a 404 while Copacker is up. The worker keeps running; stop it in Railway if the work needs it idle.
- The rules are in `src/server/maintenance.ts`. `src/server.ts` and `server/start-maintenance.ts` establish the
  invocation context before authentication; Router rewriting renders the maintenance screen at the requested URL.
  The page and API status policy is shared with the deployed compatibility proof.

## Releases

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request. A `changes` job first works out
whether the change affects Copacker (`.github/scripts/affected.mjs`): code in `apps/copacker` or a workspace package
it uses, or anything every app shares, such as the workflows, the lockfile or the root configs. Docs, Markdown and
design files don't count. A pull request is compared with its target branch, and a push with the commit staging serves.
Then, side by side:

- `verify`: format, lint, types, unused code (`check:unused`) and the other packages' tests, always; Copacker's unit
  tests with coverage, its build and every migration on an empty Postgres 18 when Copacker is affected.
- `stories`: the Storybook tests, in four shards, when Copacker is affected.
- `e2e`: the [end-to-end suite](e2e.md), in two shards, when Copacker is affected.

Turbo replays tasks whose inputs have not changed. `ci-ok` is the required aggregate check. The Cloudflare release
workflow is gated by `CLOUDFLARE_RELEASE_ENABLED` and the protected environment's `RELEASE_CUTOVER_READY`; neither
should be enabled before storage, callback, database and rollback qualification.

The [Cloudflare release guide](cloudflare.md#release-procedure) describes exact-commit promotion, scoped secrets,
static Storybook, the retained Railway worker, serialized migrations and deployed health checks. The old web container
and predeploy path are removed from this branch. Existing live services remain in place until the authorized cutover.

Migrations move forward: add columns and tables before deploying consumers, and drop obsolete fields in a later release.
A rollback uses the previous compatible web artifact and reconciled private files. To reverse a schema change, write a
new migration or restore an existing Railway scheduled backup: daily backups are kept six days, weekly backups 27 days.
Avoid permanent manual backups consuming the provider's limited backup slots.

## Infrastructure

This is the last verified **pre-cutover live inventory**; the migration branch has not changed these domains.

Railway project `copacker` (`d8195bc8-1e6d-4fd6-b7bc-8ecf9852acd6`):

| Resource                | ID                                     |
| ----------------------- | -------------------------------------- |
| Production environment  | `3fdd8f47-c9ad-44c5-b554-78b64818b4e5` |
| Staging environment     | `b822ecad-68dd-4f4f-89e0-d9db00485545` |
| Web service (`copacker`) | `79da7d29-d1d6-4aa7-9fef-709dbf2b9619` |
| Worker (`copacker-worker`) | `08c1edb8-c309-4fe4-b71e-14b54065a0fc` |
| Postgres                | `aef82310-c9f9-4472-a2bb-e19949723c31` |
| Documents bucket        | `868f3e53-a9fe-4b2b-9eeb-e69926c2b1d2` |

Each environment has its own instance of every service, database and bucket. Production answers on
`https://copacker.ai` (`APP_URL`) and `https://copacker-production.up.railway.app`; staging on
`https://staging.copacker.ai` and `https://copacker-staging.up.railway.app`. Both sign in through WorkOS's staging
environment ([WorkOS settings](auth.md#workos-settings)).

`copacker.ai` is registered with Cloudflare Registrar and uses Cloudflare DNS. The root and `staging` are proxied CNAMEs
to their environment's web service, each with a `_railway-verify` TXT record; `www` redirects to the root. SSL/TLS is
Full, since Railway doesn't work with Full (Strict). The landing film is in the `copacker-media` R2 bucket, served from
`media.copacker.ai` ([Landing page](landing-page.md#assets)).

Staging was duplicated from production. It has its own `TOKEN_ENCRYPTION_KEY` and `WORKOS_COOKIE_PASSWORD`, and uses
the development apps (Copacker Dev, Aisle Dev), so connecting a store there never rotates production's tokens. Its
worker reads its own SQS queues (`copacker-*-staging`) as IAM user `copacker-worker-staging`. To fill it with the demo
store, sign in there once, then run `railway ssh --environment staging --service copacker-worker -- pnpm --filter
copacker db:seed`.

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

Schema changes are migrations: edit `src/db/schema.ts`, run `pnpm --filter copacker db:generate`, and commit the new file
under `drizzle/`. `tests/migrations.test.ts` fails when the schema changes without a migration, when an applied
migration is edited (record each migration's hash there once it's deployed), or when migrations are numbered out of the
order they were made. The release runner uses one direct connection and an advisory lock to apply pending migrations
before deployment. Disable the old Railway predeploy migration command before activating the new release workflow.

`pnpm --filter copacker db:drift` compares a live database (`DATABASE_URL`, with `DATABASE_CA_CERT` when TLS needs it)
with a freshly migrated one (`REFERENCE_DATABASE_URL`, such as the local database after `db:migrate`), read-only on both.
To read a deployed database, go through the Railway CLI rather than storing its URL locally: `railway run` uses the
private `postgres.railway.internal` hostname, which a local computer can't reach, and the public TCP proxy needs
`sslmode=verify-ca` with the CA from Railway. Never disable certificate verification.

### Amazon connection mode

`AMAZON_SELF_AUTH_ENABLED` defaults to `true`. Settings retains the marketplace selector and adds a refresh-token field for private self-authorization, validates access with Amazon, and stores the token encrypted. The seller ID is configured server-side in `AMAZON_MERCHANT_TOKEN`; customers never enter it. The token must belong to the configured `AMAZON_CLIENT_ID` and `AMAZON_CLIENT_SECRET`. Set the flag to `false` to show the marketplace selector and launch the existing Seller Central OAuth flow. Manual-token submissions are also rejected server-side when disabled. This flag does not change existing connections.

## Preview scope

PR previews currently cover Storybook and fixture-backed UX. Do not provision preview databases or storage on Railway or reuse staging/production data. Database previews are deferred until the Neon migration, and storage previews until the Cloudflare migration, to simplify and reduce the cost of isolated resources. See the [domain inventory](domains.md#pull-request-previews) for the current deployment and the deferred persistence checklist.
