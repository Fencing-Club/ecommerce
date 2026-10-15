# Compatibility evidence

Part of the [migration specification](README.md). Updated October 15, 2026. Implementation is on `codex/tanstack-start`
under `D:\system\worktrees\ecommerce\tanstack-start`, based on `786b613` with the existing local development/domain
changes preserved. The deployed fixture and shared frontend preparation are progressing; the application's route tree
still runs on Next.

## Decisions

The authorized implementation uses TanStack Start 1.169.2, Router 1.170.44, Cloudflare Vite plugin 1.64.0, `cf`
1.0.0-beta.17 and WorkOS session package 0.7.1. Keep Vite's React plugin at 5.2.0 to preserve the
existing Babel React Compiler integration. Standalone `use-intl` 4.14.9 is the replacement for Next-specific localization;
catalogs and existing locale behavior remain the contract. Client hooks and shared translators now use it (108 import
sites), with the typed catalog augmentation moved to `use-intl`. Storybook uses its `IntlProvider`; its framework/router
conversion and the application's Next server translation integration are still pending.

The WorkOS Start SDK 0.11.1 trial exposed a cookie ordering conflict: its middleware appends automatic refresh after
the handler's explicit session change. A reproduction of its public middleware with a controlled refresh result emitted
the logout deletion followed by the refreshed session cookie. The dependency was removed. The canonical integration
uses the [public WorkOS session toolkit](https://github.com/workos/authkit-session), including its cookie serializer,
encryption, JWT verification and refresh. A Start cookie adapter and invocation context preserve unrelated response
cookies and give explicit login/logout changes precedence, even if refresh completes later. Each request owns its
service and pending network work; validated auth is reused only within that request. No SDK internals are copied.

The overview now has a server rendering-data loader and ordinary synchronous buyer/supplier views shared by the page
and stories. Page and price permissions are checked before reads; restricted attention links and admin-only setup are
removed before serialization. The data boundary preserves store time zone and restock settings and excludes identity
and organization records. Its Next route wrapper remains until the routing conversion.

The fixture uses a fresh router per request and ordinary SSR/server functions. Import protection fails the build on
server/client boundary violations. Vanilla-extract's three automatically externalized compiler modules are bundled in
the Worker environment, as required by the Cloudflare Vite plugin; unrelated externals remain prohibited. See the
[upstream integration issue](https://github.com/cloudflare/workers-sdk/issues/10287).

Worker types are generated from `cloudflare.config.ts`. The fixture has its own TypeScript project so its Worker
platform globals and Router registration do not change the current application's browser/Next types.

The nuqs TanStack Router adapter remains a trial. It is experimental and its documentation does not promise Start
support. The browser trial found that nuqs' strict Standard Schema validation turns invalid enum values into route
errors. The fixture now uses optional Zod fields with invalid-value fallbacks, accepting Router's parsed booleans.
The real partners/product-import consumers still need their complete acceptance pass before D03 is closed.

## Verified checks

The full repository `pnpm verify` passed on October 15: formatting, lint, both TypeScript projects, unused-dependency
analysis and unit/Storybook tests with coverage. This verifies the current compatibility foundation alongside the
existing Next application; it does not satisfy the completed-migration release gate V01.

`pnpm --filter copacker test:start-runtime` builds and tests the fixture in local workerd against local Postgres.
The same test script accepts an explicit `--remote <origin>` for the protected staging Worker.

Passed locally and on the deployed Worker:

- SSR with partner/import direct-link state and a preserved additional search key.
- Urdu language/direction and translated fixture text.
- Cross-origin and missing-origin POST rejection without setting cookies.
- AuthKit session storage round trip, host-only HttpOnly cookies, two response cookies and cookie clearing.
- Actual production PDF validation for a synthetic 1,000-page document and token encryption/decryption.
- Eight overlapping database transactions with connection-local temporary tables and cleanup.
- Deployed probes reject anonymous requests and require a separately generated bearer secret.

Focused unit tests also passed for Next AuthKit cookie decoding by the new SDK, the custom session writer, overlapping
database contexts and pool cleanup on failure. Cookie storage tests use synthetic identities: they **do not** establish
real WorkOS authentication, refresh or revocation by themselves. The small blank PDF does **not** establish 32 MiB
memory/CPU parity.

`pnpm --filter copacker test:start-auth <protected-worker-origin>` additionally passed against the existing WorkOS test
account on the deployed Worker: password login, JWT validation, invalid-cookie rejection, refreshed cookie persistence,
replacement login during refresh, logout during refresh, and failed refresh after revocation. The runner uses an
invalid access token inside its own sealed test cookie to exercise refresh without waiting for expiry. It revokes only
the sessions created by that run; no account is created or reset and no emails are sent. WorkOS
[may rotate refresh tokens](https://workos.com/docs/authkit/sessions), so the check verifies that the returned token pair
is persisted and accepted on the next request rather than assuming the token must change every time. Full custom
signup/verification/OAuth/organization flows still need app-level acceptance.

The integrated-browser fixture passed invalid-value fallback, both query controls, preservation of unrelated search
keys, refresh, back/forward navigation and keyboard activation. Desktop and 390-pixel mobile RTL layouts were inspected.
These fixture checks establish adapter feasibility, not completion of the actual partners/product-import screens.

The first immediate remote run encountered Cloudflare's deployment-propagation 404 on a later request; the run after
propagation passed. The runner does not hide failed assertions behind retries.

## Staging database and certificate

Railway Postgres stays authoritative. The user supplied staging credentials in ignored `apps/copacker/.env.staging`.
The public CA was read from the staging Postgres service's certificate directory; no private key was retrieved.
The connection string uses Railway's public TCP proxy, not the private hostname.

The direct connection passed TLS 1.3 with CA verification and the certificate's actual DNS identity,
`postgres.railway.internal`, verified through the public proxy. Hyperdrive uses `verify-ca`, because the proxy's public
hostname is not in the database certificate. Certificate verification is never disabled.

| Resource | Staging value |
| --- | --- |
| Cloudflare account | `544b5bfd594cd02a5da4b79a2038cc9f` |
| Uploaded CA | `copacker-staging-postgres-ca`, ID `c9fe89ea-5512-44be-9d1d-f4f6413c1a51` |
| CA SHA-256 fingerprint | `58:35:30:E7:76:90:96:ED:A9:A9:93:9E:39:68:14:57:39:DF:20:1D:B1:E1:78:C9:97:60:D2:9E:81:0B:D5:EE` |
| CA expiry | December 26, 2028, 07:33:09 UTC |
| Hyperdrive | `copacker-staging`, ID `0a74043480fe42a6acdbf46b9572ef58` |
| Hyperdrive settings | Query caching disabled; origin connection limit 5; uploaded CA with `verify-ca` |
| Compatibility Worker | `copacker-start-compatibility.hoa-preview.workers.dev` |
| Tested Worker version | `cbda7757-0284-4a42-9f63-f6f69a612cae` |
| Runtime | Compatibility date `2026-10-15`, `nodejs_compat`, logs/traces enabled |

The deployed fixture has WorkOS test-environment secrets and a separately generated cookie key, no production bindings,
no merchant credentials and no scheduled work. Synthetic codec probes remain separate from real authentication probes.
All dynamic routes require a private probe token. Its only database writes are transaction-local temporary data; it
does not migrate schemas or modify application records. Local development always targets local Postgres.

The CA is public configuration, despite the environment variable name. Database credentials and the probe token are
secrets and remain in ignored local files/Cloudflare configuration. Hyperdrive stores the database credentials and CA
reference; the Worker receives a Hyperdrive binding and does not need a `DATABASE_CA_CERT` secret.

When Railway rotates its root CA, fetch the new public CA through the authenticated staging service, compare its
fingerprint, upload it to Cloudflare and update Hyperdrive's CA reference. Re-run the connection tests before removing
the old CA. Repeat separately for production; do not assume both environments share a CA.

## Remaining proof before M0 exit

Remaining custom WorkOS signup/verification/OAuth flows; workspace/role isolation; private R2 download;
database row locks/token-refresh serialization and reconnect drills; full nuqs browser acceptance in both consumers;
maximum-size and representative PDF/ZIP/XLSX/AI workloads under concurrency; existing-service baseline and agreed
release/recovery budgets. The application route conversion, background executors and production cutover are pending.
