# Run Copacker

Node 24+ and pnpm 11 are required. Install at the root with `pnpm install`, then `pnpm dev`. The checked-in registry configuration matches the source template's corporate registry; outside that network set `PNPM_CONFIG_REGISTRY=https://registry.npmjs.org/` for install. On this host the reachable mirror is `https://packagefeedproxy.microsoft.io/npm`.

Copy `apps/copacker/.env.example` to `apps/copacker/.env`, then configure WorkOS, Railway Postgres, and the private Railway bucket. `TOKEN_ENCRYPTION_KEY` is 32 random bytes encoded as base64. WorkOS cookie password is at least 32 random characters. Do not commit environment files.

Run `pnpm --filter copacker db:migrate` before starting the web app and `pnpm --filter copacker worker` in a second process. The worker consumes durable jobs from Postgres; it does not schedule catalog or inventory syncing. Production uses a second Railway service from the same image with the worker start command. Only the web service uses the HTTP healthcheck.

## External setup

1. WorkOS: create an AuthKit application. Register `<APP_URL>/callback`, login URI `<APP_URL>/login`, and sign-out URI `<APP_URL>`. Users authenticate in WorkOS; Copacker's database owns workspace memberships and per-order supplier sharing.
2. Shopify: use a public-distribution merchant app for unrelated merchants. Register `<APP_URL>/api/connections/shopify`. Required scopes: read_products, write_products, read_inventory, write_inventory. Existing private Aisle client-credentials authorization cannot onboard unrelated stores. Supplier SKU remains the merchant-owned PRODUCTVARIANT `custom.supplier_sku` field already used by Aisle.
3. Amazon: register a public SP-API application with the AWD role and Listings access. Register `<APP_URL>/api/connections/amazon`; Amazon requires an HTTPS redirect, so test on a deployed environment rather than localhost. While the app is a draft, set `AMAZON_APP_DRAFT=true` so the consent link requests `version=beta`. Use US marketplace authorization for the first release. Tokens are encrypted per buyer organization.
4. Email: configure Resend API key and a verified sender using EMAIL_API_KEY / EMAIL_FROM. The worker sends invitations, attached POs, and label-ready notifications. No production supplier emails are sent during development.

   Use a sending-only API key. The Resend onboarding sender is suitable only for tests to the account owner's email; verify an owned domain before inviting external suppliers. Domain verification is deferred at the user's request. The 2026-09-25 test to the authorized Gmail recipient was marked Delivered in Resend. Local configuration and both Railway services have the key; the worker references the web service's email variables. No key is committed or included in logs.
5. S3: use private Railway bucket credentials. Objects are accessed only through server-authorized routes.

## Recovery

Amazon create is checkpointed before the network request. If its response is lost, do not blindly retry. Find the corresponding order in Amazon and use the buyer reconciliation form; reference and carton readback must match before confirmation proceeds. If a correction affects an existing shipment, cancel it in Amazon where supported and use Copacker's cancellation verification before creating a replacement. Copacker never invents an AWD cancellation endpoint.

Failed notification and Shopify write jobs remain visible for an owner to retry after fixing configuration. Shopify cost updates require equal currencies and use supplier piece price multiplied by the sellable pack size. No estimated exchange rate or hidden freight allocation is applied.

## Infrastructure

Railway project `copacker`: d8195bc8-1e6d-4fd6-b7bc-8ecf9852acd6. Production: 3fdd8f47-c9ad-44c5-b554-78b64818b4e5. Postgres: aef82310-c9f9-4472-a2bb-e19949723c31. Web: 79da7d29-d1d6-4aa7-9fef-709dbf2b9619. Private documents bucket: 868f3e53-a9fe-4b2b-9eeb-e69926c2b1d2. Project name identifies the deployed app; repository name is ecommerce.

Worker: `08c1edb8-c309-4fe4-b71e-14b54065a0fc`, start command `pnpm --filter copacker worker`. The web domain is `https://copacker-production.up.railway.app`, port 3000, healthcheck `/api/health`. WorkOS currently uses staging credentials; the Railway environment name does not imply production AuthKit readiness. Hosted callbacks and actual sign-in remain to be verified.

Deployment is not live yet: web deployments `f3ca67a4-67d5-42cf-9894-dc75c031b28f` and `056c3d8e-f049-4034-9c6e-32200f7b0cab`, and worker deployment `f2914a74-8d51-4fbc-bd01-57deac24ebdc`, failed before Docker build output. Bounded build logs contain only builder scheduling; the diagnosis endpoint exposes no root cause. The last upload used an explicit repository root. Investigate the build-planning failure before sending a hosted invitation. Do not recreate the database or bucket to troubleshoot stateless builds.

## Repository migration

The Fencing Club packages were copied from the current Agency working tree, excluding dependencies, build outputs, and local credentials. Actual package names are `fc-templates`, `fc-theme`, `fc-theme-base`, `shopify-emails`, and `shopify-content`. Shared TypeScript/oxlint configuration accompanies them. All 1,500 source/local-data files matched before cleanup. The user authorized deleting the originals, but automatic approval review blocked the removal; all five original package directories remain in Agency. Shared config packages remain required in both repositories. No store themes were pushed or published.

`packages/aisle` is the reusable Node-compatible commerce library extracted/adapted from the existing CLI's boundaries. It does not relocate the entire Bun CLI, local SQLite databases, or account credentials.

## Local database TLS

The local `.env` uses Railway's public TCP proxy. Its `DATABASE_URL` uses `sslmode=verify-ca`, `uselibpqcompat=true`, and `sslrootcert` pointing at the ignored `.database-ca.local.crt`. The CA was retrieved from the actual service through authenticated Railway access; it is specific to this database. This validates the certificate chain while allowing the public proxy hostname to differ from the certificate's internal hostname. Never use a CA fetched from an unauthenticated connection or disable certificate verification. Retrieve a fresh CA through Railway if the service certificate is rotated or the database replaced. Production should use the private service URL and deployed TLS configuration, not a Windows certificate path.

Local `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is `http://localhost:3000/callback`; register that exact callback in WorkOS. Keep it aligned with `APP_URL` when changing the local port or deployment URL.
