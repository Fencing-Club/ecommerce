# End-to-end tests

Copacker's Playwright suite lives in `apps/copacker/e2e` and drives the real app in Chromium: signed out, and signed in
to a buyer, a supplier and a forwarder workspace. It covers every page and the journeys between workspaces, including
uploads (commercial invoices, product labels and photos, product imports) and downloads (purchase orders, shipping
documents, labels, catalog and product exports).

## Where it runs

| When | Against | What |
| --- | --- | --- |
| Every pull request and push that affects Copacker (`e2e` job in CI, split in two) | A built Workers preview in each half, fresh Postgres and local R2 | Everything |
| Cloudflare release workflow (`deploy-staging`) | Staging | Signed-out smoke checks; full deployed qualification is a separate release gate |
| After promoting to production | Production | Only specs tagged `@smoke`: signed out and read-only |

Staging's deploy only runs once `verify`, `stories` and `e2e` pass. Local and CI runs have no background executor or
merchant credentials. The explicit demo Shopify provider serves catalog, variant, stock and cost operations from its
workspace snapshot; saving an edited draft is covered end to end. Other provider calls need separate live qualification.
On staging background jobs run; specs that only make sense locally skip themselves with `test.skip(deployed, …)`.

The fake `copacker-demo.myshopify.com` connection and `demo` token are accepted only in local, staging and preview
environments. They never fall back to the real Shopify API, and real merchant errors never switch to the demo provider.
Unsupported demo operations fail clearly; daily reconciliation skips the fake store. Production rejects demo credentials.

## Test data

`pnpm --filter copacker db:seed:e2e` (`scripts/seed-e2e.ts`) prepares a local or staging database. It refuses any other.

- The test account is `copacker-e2e@example.net` (Casey Tester) in the WorkOS staging environment. It's created on
  first use with a confirmed email, and its password is derived from `WORKOS_API_KEY` (`scripts/e2e-user.ts`), so no
  password is stored anywhere.
- For a hosted PR qualification, set a dedicated `E2E_EMAIL` for both seeding and testing, and confirm the database is
  that PR's isolated branch. Assertions use that same identity; do not reset the shared staging account's workspaces.
- It owns three workspaces: **E2E Buyer**, with the demo Shopify store from `pnpm db:seed` (`scripts/demo-store.ts`),
  **E2E Supplier**, joined as the buyer's "Demo supplier", and **E2E Forwarder**, joined as its forwarder. The buyer
  also has "Offline supplier", which isn't on Copacker, and draft purchase orders for the specs to send, one per
  scenario (`E2E-DRAFT`, `E2E-DELETE`, `E2E-CLOSE`, `E2E-REVISE`, `E2E-FULFILL`, `E2E-OFFLINE`).
- Every run deletes whatever those workspaces hold and starts them over with the same ids, so a signed-in browser stays
  in them. Seed only the designated test workspaces before a full qualification run; the release runner does not reset data.

## Running it locally

1. Start the local database (`pnpm --filter copacker db:up`). Use a dedicated test database and point the ignored
   `apps/copacker/.env` at it. Keep the dedicated WorkOS test credentials and complete [Portless setup](development.md).
2. Run `pnpm --filter copacker db:migrate`, `pnpm --filter copacker db:seed:e2e` and
   `pnpm --filter copacker build:e2e`. Reseed before rerunning destructive journeys.
3. Run `pnpm --filter copacker test:e2e`. Playwright owns its server at `<worktree>.e2e.local.copacker.ai` and refuses to
   reuse an existing route. Install Chromium once with `pnpm --filter copacker exec playwright install chromium`.

The Workers preview uses `e2e/runtime/.cloudflare/output/v0` and `.cloudflare/state/e2e`; interactive development and
release output remain separate. `E2E_DEV=1` uses Vite development mode. CI uses loopback port 3005 (`E2E_PORT` overrides
it) with the same isolated output and a fresh PostgreSQL service. Native R2 emulation replaces the old S3 mock.

`E2E_BASE_URL` explicitly targets an existing server, locally or on staging. It must have the matching test credentials
and seeded dedicated workspaces. The launcher trusts the system CA for Portless health and API calls. Fixtures wait
for root and portal hydration before interacting with streamed SSR pages, including documents opened after redirects.
Never run the full mutating suite against production.

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
