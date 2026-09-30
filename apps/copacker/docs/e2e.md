# End-to-end tests

Copacker's Playwright suite lives in `apps/copacker/e2e` and drives the real app in Chromium: signed out, and signed in
to a buyer, a supplier and a forwarder workspace. It covers every page and the journeys between workspaces, including
uploads (commercial invoices, product labels and photos, product imports) and downloads (purchase orders, shipping
documents, labels, catalog and product exports).

## Where it runs

| When | Against | What |
| --- | --- | --- |
| Every pull request and push (`e2e` job in CI, split in two) | A production build started in each half, a fresh Postgres and an S3 mock | Everything |
| After each staging deploy (`deploy-staging`) | Staging | Everything |
| After promoting to production | Production | Only specs tagged `@smoke`: signed out and read-only |

Staging's deploy only runs once `verify`, `stories` and `e2e` pass. The local and CI runs have no worker and no Shopify,
Amazon, Resend or OpenRouter credentials, so queued jobs never run and anything that calls a store live is tested up to
that call. On staging a worker runs; specs that only make sense locally skip themselves with `test.skip(deployed, …)`.

## Test data

`pnpm --filter copacker db:seed:e2e` (`scripts/seed-e2e.ts`) prepares a local or staging database. It refuses any other.

- The test account is `copacker-e2e@example.net` (Casey Tester) in the WorkOS staging environment. It's created on
  first use with a confirmed email, and its password is derived from `WORKOS_API_KEY` (`scripts/e2e-user.ts`), so no
  password is stored anywhere.
- It owns three workspaces: **E2E Buyer**, with the demo Shopify store from `pnpm db:seed` (`scripts/demo-store.ts`),
  **E2E Supplier**, joined as the buyer's "Demo supplier", and **E2E Forwarder**, joined as its forwarder. The buyer
  also has "Offline supplier", which isn't on Copacker, and draft purchase orders for the specs to send, one per
  scenario (`E2E-DRAFT`, `E2E-DELETE`, `E2E-CLOSE`, `E2E-REVISE`, `E2E-FULFILL`, `E2E-OFFLINE`).
- Every run deletes whatever those workspaces hold and starts them over with the same ids, so a signed-in browser stays
  in them. Staging's pre-deploy step runs the seed after the migrations.

## Running it locally

1. Start the local database (`pnpm --filter copacker db:up`) and an S3 mock:
   `docker run -d --name copacker-e2e-s3 -p 127.0.0.1:9090:9090 -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=copacker-e2e adobe/s3mock:5.2.3`.
2. Use a separate database, such as `copacker_e2e`, and point `apps/copacker/.env` at it, at the mock
   (`S3_ENDPOINT=http://127.0.0.1:9090`, `S3_BUCKET=copacker-e2e`, any access key and secret) and at
   `APP_URL=http://127.0.0.1:3005`. Keep the WorkOS settings.
3. `pnpm --filter copacker db:migrate`, `pnpm --filter copacker db:seed:e2e` and `pnpm --filter copacker build`.
4. `pnpm --filter copacker test:e2e`. Playwright starts `next start` on port 3005 (`E2E_PORT` changes it; `E2E_DEV=1`
   uses the dev server). `pnpm --filter copacker exec playwright install chromium` downloads the browser once.

`E2E_BASE_URL=https://copacker-staging.up.railway.app` runs the suite against staging instead; it needs
`WORKOS_API_KEY` and a seeded staging database.

## Writing specs

- `import { test, expect } from "../fixtures"`. `test.use({ role: "buyer" })` (or `"supplier"`, `"forwarder"`) signs
  the page in to that workspace; without a role the page is signed out. `pageFor(role)` opens another signed-in page,
  for a scenario that goes back and forth between partners.
- Each worker signs in once per role and carries the cookies from test to test, because AuthKit rotates the refresh
  token. Don't sign out or switch workspaces on a role's page; use a fresh context for that.
- Specs run in parallel against one database: name what a test creates with `unique()`, assert within its row or
  dialog, and give a scenario that changes a seeded purchase order its own draft.
- `e2e/support/files.ts` makes PDFs, images and CSV files to upload and reads downloaded PDFs and workbooks.
- Tag signed-out, read-only specs `@smoke` so they run against production, and phone-width ones `@mobile`.
- Locate by role, label and the English text in `messages/en`; the browser runs in `en-US`.
