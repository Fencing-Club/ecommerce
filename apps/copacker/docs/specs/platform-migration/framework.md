# Framework and frontend migration

Part of the [migration specification](README.md). Preserve the existing product while replacing Copacker's Next.js
integration with TanStack Start. The implementation uses ordinary React route components, typed TanStack Router routes,
server functions for initial page data, and server routes for existing HTTP contracts. Experimental RSC support is not
a dependency. [Start's migration guide](https://tanstack.com/start/latest/docs/framework/react/migrate-from-next-js)
describes the framework changes; the requirements below define Copacker's behavior.

## Inventory and proposed structure

The October 15 source inventory contains 40 pages, seven layouts and 62 HTTP route files. Excluding stories, 129 files
import Next APIs, 167 import next-intl, 31 use `router.refresh()`, and two directly consume nuqs. There are 205 sibling story files,
62 unit-test files and 31 Playwright spec files. Counts are a baseline, not a completeness test; special metadata routes,
assets and generated tooling also need migration. See the [route inventory](routes.md).

Use the following responsibilities, with exact filenames following the pinned Start release:

| Location | Responsibility |
| --- | --- |
| `src/routes/` | File routes, root document, pathless authenticated layouts, typed params/search, head metadata, pending/error/not-found UI and HTTP route entry points |
| `src/router.tsx` | A fresh router per request and client application; generated route-tree registration and router context types |
| `src/start.ts` | Explicit request and server-function middleware, including the CSRF policy when customizing defaults |
| `src/server/` | Authentication, authorization, domain services, server functions and provider integration; protected from client imports |
| `src/db/` | Existing schema and queries with invocation-scoped connection access |
| `src/i18n/` | Request-independent message loading/formatting and request locale resolution |
| `src/components/`, `src/hooks/`, `src/lib/` | Existing UI, hooks, safe shared schemas/types, and client HTTP requests |
| Vite and Cloudflare configuration | Framework plugins, Workers runtime, bindings, assets, environment configuration and generated binding types |

Keep the existing domain services canonical. Extract a small page-view component only when it makes a route testable
with real fixtures; do not duplicate page JSX for stories. Keep sibling stories for route/page components under the
repository convention. Generated route files are generated, not hand-edited; choose commit/ignore behavior explicitly
and make generation run before type checking in a fresh checkout.

## Server execution and data boundaries

Start loaders can execute on the server and in the browser. A loader is not a security boundary. Load protected data
through server functions or the existing HTTP endpoints; never import database modules, secrets or privileged SDKs into
an isomorphic loader. Use the framework's server-only facilities and configure import protection to fail in both
development and builds, including shared-package imports. Verify that generated browser bundles contain no secrets,
database drivers or server implementations. Sources: [execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)
and [import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection).

Each server invocation must resolve its own environment, DB client, session, active workspace, membership, permissions,
locale and time zone. Cache those lookups only within that invocation when appropriate. Never keep request data,
authenticated router instances, tenant clients or translation state in module globals. Public configuration must use an
explicit allowlist; replacing `NEXT_PUBLIC_` with a new prefix is not permission to expose the rest of the environment.

Validate every external input with existing Zod schemas, including params and server-function input. Check identity,
membership and action permission at the server operation that uses them. A parent route's `beforeLoad` is useful for
navigation but does not authorize a directly invoked server function or endpoint. Scope queries by the authorized
workspace and recheck document release/revision rules. Do not serialize price fields or other privileged columns to a
role that cannot read them, even when the component would hide them.

Return explicit DTOs containing only data needed for rendering. Choose and test serialization for dates, decimal values,
errors and optional fields; never return a Drizzle connection, WorkOS token, provider credential or raw database record
by default. Use parallel reads where independent and authorized, while controlling connection concurrency. Preserve
transaction boundaries for dependent writes.

Keep RTK Query and the existing mutation endpoints, including `/api/action`, during the port. Initial SSR page data can
use Start server functions calling the same domain services. Do not implement the same business operation separately
for server functions and REST. Every mutation needs an explicit freshness strategy: invalidate the relevant RTK Query
tags and router loader data when both contain affected information. Replace `router.refresh()` by intent, not a global
text substitution. Preserve success redirects, optimistic updates, form field errors and pending states.

## Routing, rendering and navigation

Preserve every path, HTTP method, parameter, query-string contract, trailing-slash behavior and meaningful redirect
status. Next route groups become pathless layouts; `[id]` parameters become typed Router parameters. No locale prefixes
are added. Port one complete route slice before bulk conversion: protected overview, a mutation, a private download,
localized errors and sign-out. Then use the route batches in [delivery.md](delivery.md).

Replace `next/link` and navigation hooks with typed Router links/navigation. Preserve modifier-key behavior, opening
links in new tabs, scroll/focus restoration and download links. External links and binary downloads stay normal links.
Do not enable broad intent preloading until expensive loaders, permission refresh and provider read side effects have
been audited. Reads used by loaders must not create shipments, send email or start jobs merely because a link is hovered.

Use explicit pending, error, forbidden and not-found boundaries. Preserve HTTP 403/404/503 status on document requests;
a rendered error screen with status 200 is not parity. Return safe error messages to clients, log structured server
details, and prevent private pages from appearing in shared caches or search indexes. Match hydration output by passing
the request's locale, time zone and deterministic initial data to the browser.

Port page metadata to route head definitions: localized titles/descriptions, canonical URLs, robots directives,
social metadata, favicon/icons, sitemap and robots output. Preserve marketing HTML and its selected message namespaces.
Keep the root language/direction, skip link, theme initialization and any script ordering that prevents a visible flash.

## WorkOS and workspace security

Replace `@workos-inc/authkit-nextjs`, its proxy and Next cookie/header helpers with supported Start APIs. The
[official Start SDK](https://github.com/workos/authkit-tanstack-start) is the first choice. M0 must prove its supported
session-writing API with Copacker's custom screens; copying an undocumented internal `saveSession` implementation or
silently switching to hosted login is not an acceptable shortcut. Record compatible SDK/Start versions and cookie
behavior. If the SDK cannot support a required flow, design the supported WorkOS session integration before M3 proceeds.

Preserve these flows from [auth.md](../../auth.md) and [permissions.md](../../permissions.md):

- Password sign-in/sign-up, verification code expiry, pending authentication state, password reset, invitations,
  organization selection, social sign-in and callback state/PKCE validation.
- Existing redirect targets and safe `next` handling, setup/onboarding decisions, resume cookie behavior, session
  refresh, expired/revoked sessions and POST sign-out.
- Host-only cookies, Secure/HttpOnly/SameSite behavior, cookie paths and expiry; environment-specific callback URLs and
  allowed origins. Do not trust arbitrary forwarded host/protocol headers when constructing redirects.
- Database membership checks on each protected server operation, workspace-role permissions and restricted price data.
  WorkOS authentication does not replace Copacker authorization.
- Workspace switching, tab coordination and focus checks. Clear tenant-scoped RTK Query and route data atomically on
  switch/sign-out; the old workspace must not flash or remain accessible via back navigation, prefetch or stale loaders.

Retain the existing encrypted-token key and scoped AES-GCM behavior so stored credentials remain readable. Verify Node
crypto compatibility in Workers before considering an API substitution; any change must preserve ciphertext and AAD
semantics. Keep OAuth secrets, pending session data and merchant tokens out of client state and logs.

Preserve the existing origin allowlist and return-path validation. Explicitly apply Start's CSRF middleware when a custom
Start configuration replaces the defaults; separately protect existing mutation routes with their current origin/CSRF
rules. Provider webhook callbacks use provider signatures/challenges instead of browser-session CSRF assumptions.
Test hostile sibling subdomains, missing/forged Origin, callback replay and cross-environment cookies. Source:
[Start server functions and CSRF](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions).

## Localization and query strings

The proposed replacement for Next-specific localization is `use-intl`, the standalone core used by next-intl. It
preserves the familiar provider/hooks/ICU model while request resolution and server translators become explicit. This
is a proposed dependency decision, not an installed library; record agreement with the preferred-stack policy before
adding it. Reusing an API name does not guarantee all server helpers are interchangeable. Source:
[next-intl core library](https://next-intl.dev/docs/environments/core-library).

Retain all nine locales, English fallback, typed keys, ICU argument validation, rich messages and localized errors.
Resolve locale from profile preference, then Accept-Language, then English; retain the `tz` cookie and matching
server/browser formatting. Keep background-job/email translators independent of a request. Preserve Urdu RTL and line
height, left-to-right filenames, Latin/script-specific font preloads and marketing namespace reduction. Update all
next-intl imports rather than leaving a hidden Next dependency. See [localization.md](../../localization.md).

Trial nuqs before considering replacement. Its [TanStack Router adapter](https://nuqs.dev/docs/adapters) is experimental and its
documentation does not claim complete Start support. The acceptance slice is deliberately small:

| Consumer | Existing URL contract | Required checks |
| --- | --- | --- |
| `partner-actions.tsx` | `?add=supplier` or `?add=forwarder` opens the corresponding sheet | Direct SSR load, hydration, close/remove key, invalid enum, navigation/back/forward and unrelated query keys |
| `supplier/product-transfer.tsx` | `?import=true` opens product import; default is closed | Direct SSR load, boolean parsing, close, role access, navigation/back/forward and unrelated query keys |

Place the adapter at the supported router boundary. Ensure Router search validation neither strips nuqs-owned keys nor
creates competing navigation updates. Preserve existing history semantics, document them in tests, and keep
`NuqsTestingAdapter` where appropriate in stories. Keep the adapter if these tests pass on deployed Start. Only if it
fails, record the failing behavior and replace these two uses with typed Router search state in one focused task; do
not build a generic compatibility layer. That fallback is a contingency, not additional planned work.

## Styling, assets, caching and maintenance

Keep shadcn/Base UI, Tailwind v4 and existing vanilla-extract styles. Use the existing vanilla-extract Vite plugin, keep
React Compiler enabled, and prove its compatibility with the pinned Vite/Start/React combination. Avoid adding manual
memoization as a migration workaround. Verify CSS order, production extraction, dynamic routes and Storybook parity.

Replace `next/font` with locally served, licensed font files and equivalent CSS/preloads. The four current `next/image`
consumers use unoptimized images; ordinary images with explicit dimensions/loading/alt behavior are a viable replacement.
Audit each use before removing the dependency. Preserve CSP/security headers, image source permissions, public file URLs,
theme behavior and the existing WebGL/browser-only loading boundaries.

Initially bypass CDN caching for authenticated HTML, APIs, callbacks and private documents. Use fingerprinted caching
for static assets and explicit policies for public pages. Replace the shipments page's `unstable_cache` deliberately:
preserve its bounded freshness with tenant/connection-specific keys and invalidation on disconnect or permission
change, or accept measured uncached reads. Never substitute a process-global cache with cross-tenant keys. Router
freshness, RTK Query caches, server caches and CDN caches are separate policies that need separate tests.

Replace the process-based WorkOS feature-flag poller with a bounded request-compatible lookup/cache and explicit outage
behavior. Maintenance must remain available without DB/auth availability, preserve the requested URL, return 503 with
Retry-After and no-store, and produce the correct HTML or API response while allowing existing exceptions. Maintenance
does not pause background work; job execution has a separate control. Preserve health status and deployed commit output.

## Development, stories and build migration

Use Cloudflare's Vite runtime locally for server code, with separate Node tooling for migrations and any retained
processor. A normal Vite browser build alone does not prove Workers compatibility. Generate binding types and pin a
tested compatibility date/flags; keep logs and traces explicitly enabled at deployment. Use `cf` for Copacker project
configuration and inspect supported commands instead of copying Wrangler commands from framework examples. Sources:
[Start on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/),
[Vite runtime](https://developers.cloudflare.com/workers/local-development/vite-plugin/) and
[cf project configuration](https://developers.cloudflare.com/cf/projects/cloudflare-config/).

| File area | Required change |
| --- | --- |
| `package.json`, lockfile, Vite/config/TypeScript files | Replace Next build/runtime and plugins; choose compatible Start/Router/WorkOS/Cloudflare versions; remove Next-generated type references |
| `src/app`, `src/proxy.ts`, framework helpers | Move routes, middleware and metadata to Start; replace Next imports; delete obsolete canonical implementations after the port |
| `.storybook` and story decorators | Use `@storybook/react-vite`, a memory router and locale/request fixtures; remove Next navigation mocks and next-intl server aliases |
| Vitest, coverage and story inventory tests | Point at new routes and server files, keep meaningful existing coverage, add Workers integration coverage; exclude only generated artifacts |
| Playwright and `scripts/dev*`, `scripts/test-e2e.ts` | Run the production Workers build, preserve explicit target rules and separate E2E output/runtime state, Portless names, host-only cookies and CA trust |
| Turbo, knip, gitignore and environment examples | Declare actual observed build outputs/env inputs; recognize route generation; remove obsolete Next artifacts and classify secrets versus public values |
| CI, deployment scripts, Docker/Railway configuration | Add Workers build/deploy and serialized migration job; remove web-only container configuration when the web cutover is proven |
| Operational/developer docs and preferred stack | Update instructions only when the associated behavior changes; keep retained worker/DB instructions until their own cutovers |

Do not add a second router-generation plugin if the pinned Start plugin already owns that work. Do not import a Next
tooling helper from a shared package after removing `next` locally. Check `@repo/aisle`'s transitive runtime imports,
email rendering and all build tools; remove Next-only packages only when no remaining consumer needs them.

Keep local Postgres and CI data isolated. Cloudflare local R2 can replace object-store emulation only for code using its
bindings; a retained Node S3 client needs a compatible endpoint or explicit development adapter. Preserve Portless
worktree hostnames and separate app/stories/E2E hosts. Never disable TLS verification or stop another checkout's proxy.
If Podman is desired, first prove Compose compatibility, Postgres readiness, persistent volumes, reset/backup operations
and Windows networking. It is optional and must not delay the framework migration.
