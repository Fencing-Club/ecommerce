# Compatibility evidence

Part of the [migration specification](README.md). Updated October 15, 2026. Implementation is on `codex/tanstack-start`
under `D:\system\worktrees\ecommerce\tanstack-start`, based on `786b613` with the existing local development/domain
changes preserved. The deployed fixture and shared frontend preparation are progressing; the application's route tree
still runs on Next.

## Decisions

The authorized implementation uses TanStack Start 1.169.2, Router 1.170.44, Cloudflare Vite plugin 1.64.0, `cf`
1.0.0-beta.17 and WorkOS session package 0.7.1. Keep Vite's React plugin at 5.2.0 to preserve the
existing Babel React Compiler integration. Standalone `use-intl` 4.14.9 is the replacement for Next-specific localization;
catalogs and existing locale behavior remain the contract. Migrated client hooks and shared translators now use it,
with the typed catalog augmentation moved to `use-intl`. Storybook uses its `IntlProvider`; its framework/router
conversion and the application's Next server translation integration are still pending.

Shared server errors, Zod messages, pricing, preparation instructions and store time zones now use standalone
localization backed by invocation-scoped `AsyncLocalStorage`. Current Next entry points supply a lazy configuration
resolver; nested operations reuse it without another lookup. Untranslated background work retains English/UTC and
does not acquire an email-job language. Browser-safe text definitions are separate from request storage; the production
build exposed and verified removal of an inventory helper's indirect server import. Seventeen focused unit cases cover
concurrent requests, cached lookups, defaults, profile precedence, invalid time zones and the Next API boundary.
The protected Start probe runs the canonical helpers in all nine languages and two time zones concurrently. Its
language selection uses browser preferences; the protected portal fixture additionally reads the authenticated
profile's preferred language and renders the canonical overview in that language.

The WorkOS Start SDK 0.11.1 trial exposed a cookie ordering conflict: its middleware appends automatic refresh after
the handler's explicit session change. A reproduction of its public middleware with a controlled refresh result emitted
the logout deletion followed by the refreshed session cookie. The dependency was removed. The canonical integration
uses the [public WorkOS session toolkit](https://github.com/workos/authkit-session), including its cookie serializer,
encryption, JWT verification and refresh. A Start cookie adapter and invocation context preserve unrelated response
cookies and give explicit login/logout changes precedence, even if refresh completes later. Each request owns its
service and pending network work; validated auth is reused only within that request. No SDK internals are copied.

Custom sign-in operations now accept explicit request headers, cookie access and a supported session writer, with no
Next imports in the canonical flow. Both framework request boundaries call that implementation. The deployed Start
password probe uses the real application operation, including safe return paths and pending-cookie cleanup. Start
server routes also exercise Google/Microsoft PKCE initiation and callback state rejection. The verification page DTO
contains only the email address, not the pending token or saved redirect. Thirty-nine focused authentication tests cover
the flows, session precedence, cookie attributes, overlapping requests, unregistered hosts and tampered cookies.

The overview now has a server rendering-data loader and ordinary synchronous buyer/supplier views shared by the page
and stories. Page and price permissions are checked before reads; restricted attention links and admin-only setup are
removed before serialization. The data boundary preserves store time zone and restock settings and excludes identity
and organization records. Its Next route wrapper remains until the routing conversion.

Ten more portal routes now use explicit rendering data: catalog list/detail/new, customer list/detail, product
list/detail, inventory, sales and restock. Seven synchronous page views have separate browser modules and are shared
with their page stories; the product and catalog editors remain their existing canonical components. The new loaders
check permissions before reading, omit internal ownership and connection fields, strip unit/volume prices when denied,
and omit customer order rows without order access. Catalog pages, mutations and downloads explicitly require the
price grant, including for inconsistent existing memberships. New product creation also checks that grant.

Eighteen new database-backed tests cover those boundaries, invalid/foreign IDs, minimal data, scalar query handling,
and catalog mutation rejection. They passed with the 207 existing workflow cases. The view and loader preparation does
not yet replace these routes' Next entry points with Start server functions.

Workspace resolution, profile initialization, membership checks and role/page guards are also framework-independent.
The existing Next routes call the same canonical functions bundled in the Start Worker. Each operation reads current
memberships; workspace cookies cannot grant access, fallback selection is deterministic, and the switcher receives
only ID/name/kind. Concurrent profile creation reads the winning saved profile rather than manufacturing a result.

The fixture uses a fresh router per request and ordinary SSR/server functions. Import protection fails the build on
server/client boundary violations. Vanilla-extract's three automatically externalized compiler modules are bundled in
the Worker environment, as required by the Cloudflare Vite plugin; unrelated externals remain prohibited. See the
[upstream integration issue](https://github.com/cloudflare/workers-sdk/issues/10287).

Worker types are generated from `cloudflare.config.ts`. The fixture has its own TypeScript project so its Worker
platform globals and Router registration do not change the current application's browser/Next types.

Keep nuqs 2.10.1 with its experimental TanStack Router adapter for the two existing consumers. The actual partner
creation and product-import controls passed the local and deployed Start trial described below. This decision applies
to the tested package combination; [nuqs' documentation](https://nuqs.dev/docs/adapters) still does not promise Start
support. Repeat this acceptance when upgrading the adapter or Router.

## Verified checks

The full repository `pnpm verify` passed: formatting, lint, both TypeScript projects, unused-dependency analysis and
unit/Storybook tests with coverage, including 2,348 Copacker tests across 287 files after private storage and maintenance
were migrated. This verifies the current compatibility foundation alongside the existing Next application; it does not satisfy the completed-migration release
gate V01.

The current Next production build also passed after the private download and maintenance boundaries changed. Integrated-browser
checks covered buyer desktop/mobile layouts, date/channel controls by keyboard, a member without stores/admin setup, and the
Urdu supplier overview without horizontal overflow. The Urdu case now has an automated story. An extra live production
Next smoke-server launch was rejected by automatic approval review without a reason, so that additional check remains
pending. Storybook's Vite 8 WebSocket options now use its supplied HTTP server, avoiding another worktree's default port.

The catalog/customer/product/inventory/sales/restock views passed their automated stories. Integrated-browser checks
covered the canonical customer and product views on desktop and mobile, keyboard tabs and catalog selection, restricted
member data/actions, and the Urdu customer layout without page overflow. A fresh browser check reported no errors.

After request localization changed, integrated-browser acceptance covered the order list's Urdu desktop and narrow
layouts, translated Amazon network conjunction, keyboard access to the PO link, and retained RTL direction. The new
Urdu story asserts the server-generated destination alongside the client UI. The browser reported no errors on the
fresh acceptance tab. One earlier tab crashed while full verification and a production build were running concurrently;
acceptance was repeated after those processes finished.

`pnpm --filter copacker test:start-runtime` builds and tests the fixture in local workerd against local Postgres.
The same test script accepts an explicit `--remote <origin>` for the protected staging Worker.

Passed locally and on the deployed Worker:

- SSR with partner/import direct-link state and a preserved additional search key.
- Urdu language/direction and translated fixture text.
- Eighteen concurrent localization requests across all nine languages and two time zones, including translated errors,
  pricing, preparation instructions and dates; invalid language/time-zone fallback without response cookies.
- Cross-origin and missing-origin POST rejection without setting cookies.
- AuthKit session storage round trip, host-only HttpOnly cookies, two response cookies and cookie clearing.
- Custom Google/Microsoft OAuth initiation with PKCE, encrypted ten-minute host-only cookies, unknown-provider rejection,
  and callback rejection/cleanup for missing or forged state. These checks do not follow the external provider URL.
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

The authenticated deployed run also exercised workspace resolution through Hyperdrive using the production schema's
shape in transaction-local temporary tables. It rejected unauthenticated access and a foreign workspace selection,
enforced read-only grants, observed permission updates and removed revoked membership. Existing staging application
records were neither read nor changed by that probe. Twelve database-backed unit cases cover those behaviors, concurrent
callers, empty memberships, invalid IDs, minimal switcher data and competing profile creation. App-level workspace
switching, cross-tab behavior and browser cache isolation remain pending.

The integrated-browser fixture passed invalid-value fallback, both query controls, preservation of unrelated search
keys, refresh, back/forward navigation and keyboard activation. Desktop and 390-pixel mobile RTL layouts were inspected.
These fixture checks establish adapter feasibility, not completion of the actual partners/product-import screens.

The first immediate remote run encountered Cloudflare's deployment-propagation 404 on a later request; the run after
propagation passed. The runner does not hide failed assertions behind retries.

## Auth page route conversion

Five real Start routes now render the canonical auth UI: login, signup, verify-email, forgot-password and reset-password.
The Next routes use the same page loader and rendering component. Request-only redirects stay in the loaders; the
verification response contains the email only, and invitation email comes from WorkOS rather than the query string.
The fixture retains the six auth operations at /api/action with the production action registry, input validation,
request-local database scope and localized errors. Unsupported methods explicitly return 405 with Allow: OPTIONS, POST;
OPTIONS returns 204. Without the method handlers Start would fall through to HTML. Vite's automatic CORS handling is
disabled so the Worker owns preflight responses. Other application actions are unavailable in the fixture.

Form feedback and the validated submission lifecycle no longer import a router. Auth success opens a fresh document
(including external SSO), while the portal's existing forms retain their current refresh behavior until portal routing
moves. Auth-page links use document navigation. Tests and stories render the canonical UI rather than copied page JSX.
The root documents now share local Geist/Geist Mono files and language-specific font definitions; the separate marketing
Caveat font remains on Next.

Focused checks cover safe return paths, setup and signed-in redirects, invitation email locking, expired verification,
recovery without a session, server/client validation and form error recovery. Integrated-browser acceptance on the
Start Workers preview covered desktop and 390-pixel mobile forms, keyboard recovery links, carried email, sign-up
validation and incomplete reset links. No horizontal overflow or browser errors were observed in those checks.
Runtime HTTP checks additionally cover English/Urdu SSR, private cache headers, no token leakage, localized invalid
credentials input, missing/foreign-origin rejection and unsupported methods.

The deployed checks passed again with body-carrying cross-origin requests and real WorkOS test-account password login
through /api/action. Authenticated login/signup routes redirect to a safe local return path. JWT validation, refreshed
session persistence, replacement login, logout precedence and revoked refresh also passed on this deployment.

On Windows, rejecting an unread POST body in the local Vite/workerd preview caused its following request to fail inside
Miniflare's HTTP proxy with ECONNRESET. The behavior reproduced independently of the auth handler on the existing probe,
on Node 24 and 26. This resembles the [upstream unconsumed-body report](https://github.com/cloudflare/workers-sdk/issues/15709);
the exact underlying cause is not established. Local CSRF checks therefore send no body; the deployed checks send bodies
and keep normal connections. No assertion retries or production request-draining workaround were added.

These routes run in the protected compatibility Worker, not the application's production entrypoint. Complete provider
OAuth, email delivery/verification/reset, invitation/onboarding, portal navigation and app-level private downloads
remain required before cutover.

## Maintenance request boundary

The canonical maintenance lookup now uses WorkOS's [public flag API](https://workos.com/docs/reference/feature-flags/flag)
with a two-second deadline covering headers and body, no retries, and a ten-second cache of completed global values.
It preserves no-context evaluation: both `enabled` and `default_value` must be true, so targeted "Some" rules do not
close the service. A cold failure leaves the service available; a warm failure retains the last known setting. Deleted
flags turn maintenance off. Each overlapping request owns its fetch, later observations win, and no process poller or
pending request promise is shared between Worker invocations. Credential changes discard the previous environment's
snapshot. Provider error bodies and credentials are not logged.

The Next proxy uses the same policy through its remaining rewrite boundary. Start handles maintenance before creating
an authentication context or reading the database. HTML and HEAD requests return 503 with Retry-After and no-store;
API calls and Start server functions receive translated JSON. Visitor home, marketing/forms, health, polling and static
assets remain exempt. Internal invocation state controls the maintenance route; a caller-supplied maintenance header
cannot activate it. The canonical screen uses standalone translations and ordinary document links, with marketing
style constants separated from Next components.

The Start router uses [bidirectional URL rewriting](https://tanstack.com/router/latest/docs/guide/url-rewrites) to render
the maintenance route while retaining the requested address. Integrated-browser acceptance found that rewriting the
Request itself broke hydration, and an input-only rewrite triggered a canonical redirect. The final mapping preserves
the same public URL on server and client. English desktop and Urdu 390-pixel mobile acceptance passed, with keyboard
access to contact, no horizontal overflow, and no errors in the fresh browser tab. Turning off the local fixture flag
automatically reloaded the original login URL, including its return-path query. An Urdu story covers the shared screen.

Twenty-two unit cases cover the cache/deadline/outage policy, concurrent observations, environment changes, route and
cookie matching, translated errors, HEAD, invocation isolation and URL round trips. Local and deployed HTTP checks
passed English/Urdu HTML, API/server-function denial, polling, visitor exemption and forged-header rejection. A read-only
WorkOS SDK lookup matched the deployed poll endpoint. Fixture-only forcing remains behind its bearer gate; no live
WorkOS flag was changed. The first request sequence immediately after deployment returned a transient 404; direct checks
after propagation and the subsequent complete run passed without assertion retries.

## Private storage and document download boundary

The single-document download now has a framework-independent service shared by the existing Next endpoint and the
Start compatibility Worker. Its order lookups report domain not-found errors, which Next maps at its request boundary.
It preserves buyer/supplier/forwarder access, document-kind restrictions, price grants, release/revision checks and
attachment/security headers. It also rechecks current membership permissions after opening storage, closing a race
where membership could survive while the required page or price grant was revoked.

`server/storage.ts` accepts an invocation-scoped storage provider. The retained Node services keep S3 configuration;
Workers use their native private R2 binding. `readFile` returns a stream for downloads, while existing PDF processors use
`getFile` for bytes. Denied or withdrawn downloads cancel the pending stream, and the S3 transport closes its client on
completion, cancellation and failure. This does not convert packet assembly or import-source downloads to streaming.

The new `copacker-staging-private` bucket has no custom domains and its managed r2.dev access is disabled. No production
documents were copied and the public media bucket was not repurposed. Local tests use the local R2 simulation. Protected
remote probes write only random `compatibility/` objects and remove each owned key in a finally block; database fixtures
use transaction-local temporary tables rather than existing application records.

Focused checks cover concurrent storage contexts, Node stream lifetime, withdrawal/cancellation, page/price revocation,
and existing document workflows. Local Workers checks passed native R2 write/read/delete, content-type/size metadata,
streamed reads and processor reads. See the [R2 binding contract](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
and [public-access settings](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Authenticated deployed checks passed buyer/supplier/forwarder downloads with valid PDF contents and private attachment
headers. They rejected foreign workspaces, drafts, hidden document kinds, outdated documents, unreleased labels and
wrong revisions, plus replacements, withdrawn releases, removed supplier relationships/memberships and revoked
page/price grants during storage access. Denied responses contained no PDF bytes; English permission messages preserve
their page names and the Urdu missing-document response uses the request locale. The existing Next workflow suite
continues exercising the same canonical download service.

Live Node-to-R2 S3 access, full object reconciliation/recovery, maximum-size concurrent workloads and the production
download route conversion remain pending. This private-bucket proof does not complete the storage migration.

## Protected overview and portal controls

The protected Start fixture now renders the canonical buyer and supplier overview through a validated server
function. `portalSession` resolves current memberships and requires a complete profile on every operation; it does not
trust parent-loader state. Shell data is an explicit DTO without organization/provider settings. Overview access is
checked before loading reports, and missing price permission returns localized forbidden content with HTTP 403.
Anonymous requests and incomplete profiles preserve their return paths. The fixture also covers workspace switching,
workspace checks, header search, sales search, and the actual POST `/logout` contract.

The shared shell is synchronous, with explicit sidebar state and pathname. Search navigation, period/channel changes
and refresh callbacks belong to each route. Start invalidates its loaders; Next retains its existing refresh boundary.
The period helper preserves unrelated/repeated search keys and removes obsolete range keys together. Root message
selection includes portal namespaces only for the overview and query-control trial. Native product images retain dimensions, lazy loading and
async decoding. Shared error/forbidden views are used by both route boundaries.

Workspace changes set a host-only HttpOnly cookie only after a fresh membership lookup, then start a new document and
notify other tabs. The portal's client providers are keyed by workspace. Focus checks reload after revoked access or
sign-out, and restored browser-history documents reload. More complete logout/back-cache and membership-revocation
acceptance remains a release gate.

Portal fixtures always shadow application tables with transaction-local temporary tables, even without a scenario
header. They copy schema shapes, never existing rows; staging requires the private gate and a real WorkOS test session.
An explicit local-only scenario enables the reserved browser-preview identity. The new transaction context ensures
nested canonical services stay on that transaction's connection. Fixture provisioning is not a production latency
measurement. No production records, settings, provider connections or jobs were changed.

Local/deployed checks cover both workspace kinds, profile-language precedence, sidebar persistence, onboarding and
permission redirects, HTTP 403 without overview data, membership-checked switching, foreign-workspace/origin rejection,
search contracts and concurrent request isolation. Integrated-browser acceptance covers period changes/back navigation,
cross-tab workspace replacement, keyboard search, permission revocation during client navigation, and the mobile Urdu
layout without horizontal overflow. Full `pnpm verify` passed, including 2,360 Copacker tests across 292 files; the Next
production build and local/deployed Workers runtime checks also passed for this shared-code increment.

The main app still runs on Next. Remaining portal routes, registered typed links, complete auth/onboarding flows,
app-level private download entry points, release cache drills and production cutover are not completed by this fixture.

## Actual nuqs consumers

`AddPartner`, `InviteSupplier`, `AddForwarder`, `SupplierForm` and `ActionForm` now have canonical browser modules
without Next imports. Their successful mutations call an explicit route-owned refresh callback. Next's partner and
product pages bind that callback to their current router; the Start trial binds it to loader invalidation. The product
import control uses the same boundary and validates its preview/commit responses before using them. Stories cover
successful callbacks, validation, permission restrictions, server failures and malformed preview data.

The protected `/query/partners` and `/query/products` fixture renders these actual controls with current membership
permissions. Local and deployed browser checks cover supplier/forwarder direct links, opening and closing through the
menu, Cancel/Escape, empty form validation, invalid enum/boolean values, `import=false`, permission-restricted deep
links, typed navigation and Back/Forward restoration. Closing removes only the owned key, including when unrelated
keys repeat. Urdu mobile checks cover both dialogs without horizontal overflow; no hydration/console errors appeared.
nuqs retains its existing default **replace** history behavior; navigating between documents adds history entries.

Router's default JSON search encoding changed repeated URL values into a JSON array during normalization. The router
now uses [custom search serialization](https://tanstack.com/router/latest/docs/guide/custom-search-param-serialization)
through `URLSearchParams`, preserving repeated values and opaque strings. Route validators own only their known keys;
invalid dialog state is removed by a 307 redirect without dropping unrelated keys. Shared URL tests also cover numeric
and boolean values, empty/removal behavior, unsupported nested objects and prototype-like query names.

The staging checks exposed a separate fixture connection dependency: a domain transaction could wait for localization
while the profile-locale transaction waited for another Hyperdrive connection. Logs showed a stalled `BEGIN`; the
origin showed an idle transaction after its profile read. The fixture now resolves localization before acquiring a
domain transaction. Unit coverage checks this order and failure propagation; local/deployed acceptance overlaps six
pages against the unchanged five-connection staging budget. Hyperdrive uses
[transaction pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/); production request
boundaries must likewise avoid holding a transaction while acquiring another connection for dependent work.

The final `pnpm verify` includes 2,375 Copacker tests across 301 files. The Next production build and local/deployed
Workers runtime/authentication checks passed. The new routes test URL state and form interactions, with no real partner
invitations or product-import writes. Existing mocked stories cover submissions. Porting the actual partner/product
routes and import/export/template endpoints, and verifying freshness after real mutations, remain M3/M4 work. M0-06
and decision D03 are complete; the overall compatibility milestone is still open.

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
| Private R2 binding | `DOCUMENTS`, bucket `copacker-staging-private` in WNAM; managed public access disabled; no custom domains |
| Tested Worker version | `a4c44b60-072a-44ee-a2a3-625f79981872` |
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

Remaining custom WorkOS signup/verification/OAuth flows; complete workspace/logout browser-cache isolation; app-level private download acceptance;
database row locks/token-refresh serialization and reconnect drills;
maximum-size and representative PDF/ZIP/XLSX/AI workloads under concurrency; existing-service baseline and agreed
release/recovery budgets. The application route conversion, background executors and production cutover are pending.
