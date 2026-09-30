# Run Copacker

Install the monorepo first ([Setup](../../../docs/setup.md)). Copy `apps/copacker/.env.example` to `apps/copacker/.env` and fill it in. `TOKEN_ENCRYPTION_KEY` is 32 random bytes
encoded as base64; `WORKOS_COOKIE_PASSWORD` is at least 32 random characters. Never commit environment files.

Run `pnpm --filter copacker db:up` and `pnpm --filter copacker db:migrate` before starting the web app, and
`pnpm --filter copacker worker` in a second process. The worker runs the durable jobs queued in Postgres. Staging and
production run it as a second Railway service built from `Dockerfile.worker`, which skips `next build` and runs the
worker's TypeScript through tsx. Only the web service has the HTTP healthcheck (`/api/health`).

## External setup

1. WorkOS: an AuthKit application, set up as in [WorkOS settings](auth.md#workos-settings). Copacker draws its own
   sign-in pages against the WorkOS API; its database owns workspace memberships and per-order sharing.
2. Shopify: a public-distribution app with `<APP_URL>/api/connections/shopify` as its redirect and the scopes in
   `apps/copacker/shopify.app.toml`. Product details copied from Shopify metafields are in
   [Variation and product details](api-contract.md#variation-and-product-details).
3. Amazon: a public SP-API application with the AWD role and Listings access, redirecting to
   `<APP_URL>/api/connections/amazon`. Amazon requires an HTTPS redirect, so test it on a deployed environment. While the
   app is a draft, set `AMAZON_APP_DRAFT=true`: the consent link then asks for `version=beta`, and sellers can connect by
   self-authorization. Tokens are encrypted per workspace.
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
5. Storage: a private Railway bucket (`S3_*`). Objects are only read through server-authorized routes.
6. Privacy policy and terms: developer programs and app listings ask for `<APP_URL>/privacy` and `<APP_URL>/terms`
   ([Landing page](landing-page.md)).

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
- The page skips sign-in and the database, so it works while Postgres is down. If WorkOS can't be reached, Copacker
  stays up.
- `/maintenance` is a 404 while Copacker is up. The worker keeps running; stop it in Railway if the work needs it idle.
- The rules are in `apps/copacker/src/server/maintenance.ts`. `next.config.ts` shows the page for requests the proxy
  marks, since a rewrite from the proxy itself leaves the app when the server's hostname is 127.0.0.1.

## Releases

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request, in three jobs side by side:

- `verify`: format, lint, types, unused code (`check:unused`), the other packages' tests, Copacker's unit tests with
  coverage, Copacker's build, and every migration on an empty Postgres 18.
- `stories`: the Storybook tests, in four shards.
- `e2e`: the [end-to-end suite](e2e.md), in two shards.

When all three pass on a push, `deploy-staging` deploys the commit to Railway's staging environment and runs the
end-to-end suite against it, unless a newer commit is already the tip of `main`; that push deploys instead. Pushes run
side by side, and a new push to a pull request replaces its older run. To release to production, run the **Promote to
production** workflow in GitHub Actions. It releases the commit staging serves, then runs the signed-out smoke specs
against production.

Both run `.github/scripts/deploy.sh`. It sets `APP_COMMIT_SHA` on both services, then deploys the web service (its
pre-deploy step runs the migrations) and then the worker. It waits for each deployment to succeed, then for
`/api/health` to report the commit. Deploys to one environment never overlap, and none cancels another.

- Secrets: `RAILWAY_STAGING_TOKEN` and `RAILWAY_PRODUCTION_TOKEN`, Railway project tokens scoped to their environment
  (Project settings, Tokens), and `WORKOS_API_KEY`, the WorkOS staging environment's key, which the end-to-end suite
  signs in with.
- Staging's web service pre-deploy command is `sh -c "pnpm --filter copacker predeploy && pnpm --filter copacker
  db:seed:e2e"` (set in Railway), so every staging deploy starts the end-to-end workspaces over. Railway doesn't run the
  command in a shell, so without `sh -c` the `&&` reaches pnpm as arguments. Production's only migrates.
- Variables: `STAGING_URL` (`https://copacker-staging.up.railway.app`), `PRODUCTION_URL` (`https://copacker.ai`).
- Migrations run on staging first, and production only gets a commit whose migrations already ran there. They only go
  forward: the worker and the previous web release briefly run against the new schema, so add columns and tables in one
  release and drop old ones in a later one. To undo a release, redeploy the previous deployment in Railway; to undo a
  migration, write a new one, or restore one of Railway's scheduled backups of production Postgres: daily (kept 6 days)
  and weekly (27 days). Don't take manual backups: they never expire, and they count toward Railway's 10 per volume,
  scheduled ones included.
- CI caches the pnpm store and turbo's results, so lint, types and tests replay for packages a push didn't change.
- Deploying by hand with `railway up` still works; prefer the workflows so the health check reports the commit.

## Infrastructure

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
`NEXT_PUBLIC_WORKOS_REDIRECT_URI` is `http://localhost:3000/callback`. Webhooks, notifications and queues per
environment are in [Shopify webhooks and Amazon notifications](notifications.md).

Schema changes are migrations: edit `src/db/schema.ts`, run `pnpm --filter copacker db:generate`, and commit the new file
under `drizzle/`. `tests/migrations.test.ts` fails when the schema changes without a migration, when an applied
migration is edited (record each migration's hash there once it's deployed), or when migrations are numbered out of the
order they were made. The web service's pre-deploy command runs the `predeploy` script in `apps/copacker/package.json`
(today, `db:migrate`), so changes to it ship with the code; only the web service runs it, so migrations never run twice.

`pnpm --filter copacker db:drift` compares a live database (`DATABASE_URL`, with `DATABASE_CA_CERT` when TLS needs it)
with a freshly migrated one (`REFERENCE_DATABASE_URL`, such as the local database after `db:migrate`), read-only on both.
To read a deployed database, go through the Railway CLI rather than storing its URL locally: `railway run` uses the
private `postgres.railway.internal` hostname, which a local computer can't reach, and the public TCP proxy needs
`sslmode=verify-ca` with the CA from Railway. Never disable certificate verification.
