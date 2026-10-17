# Domains and provider configuration

This is the configuration inventory for local development, staging and production. Update it in the same change as
any hostname, authentication provider, integration callback or webhook. Never put credentials in this document.
Local launchers implement the development addresses; provider registrations and public DNS are separate changes.
See [local development](development.md) for commands and [operations](operations.md) for releases.

Staging and both Storybook domains serve Cloudflare Workers. Production web was restored to its retained Railway
artifact after the first cutover exposed an eBay forwarding failure. Staging's `workers.dev` aliases address the same
deployments; the production target disables `workers.dev` and preview URLs. Public URLs and provider callbacks are unchanged. See the
[cutover acceptance record](specs/platform-migration/acceptance.md) for release and recovery evidence.

## Environment addresses

All addresses below use HTTPS unless explicitly stated. The primary checkout uses `local.copacker.ai`; `<worktree>`
means a linked checkout's normalized folder name, without a hash. Branch changes do not change addresses.
`pnpm --filter copacker dev:urls` prints exact addresses. There is no `main` or `app` label for the primary checkout.
The naming change is implemented in the launcher; external activation is tracked separately below.

| Surface | Development | Staging | Production | Configuration / status |
| --- | --- | --- | --- | --- |
| Application and API | `local.copacker.ai`; `<worktree>.local.copacker.ai` | `staging.copacker.ai` | `copacker.ai` | Local: Portless. Staging: TanStack Start Worker. Production: retained Railway artifact pending corrected cutover |
| Storybook | `stories.local.copacker.ai`; `<worktree>.stories.local.copacker.ai` | `stories.staging.copacker.ai` | `stories.copacker.ai` | Local: Portless. Cloudflare assets-only Workers live in both environments |
| E2E target | `e2e.local.copacker.ai`; `<worktree>.e2e.local.copacker.ai` | `staging.copacker.ai` | `copacker.ai` | Dedicated local process; full staging suite; production read-only smoke suite |
| CI E2E target | `http://127.0.0.1:3005` inside each isolated CI job | Not applicable | Not applicable | No public DNS or local CA in CI |
| Railway application alias | None | `copacker-staging.up.railway.app` | `copacker-production.up.railway.app` | Previous artifacts retained for rollback; keep callbacks/origin restrictions while aliases remain usable |
| Public webhook delivery | Owned tunnel-issued HTTPS URL | Application origin | Application origin | Opt-in public tunnel or receiver forwarding to app paths; no extra local server or default subdomain |
| WorkOS-to-app callback | App origin + `/callback` | App origin + `/callback` | App origin + `/callback` | Different from Google's callback into WorkOS |
| Google/Microsoft-to-auth-provider callback | Exact URI shown in WorkOS provider settings | Exact URI shown in WorkOS provider settings | Exact URI shown in WorkOS provider settings | Currently shared WorkOS staging environment; no invented `auth.copacker.ai` hostname |
| Auth-provider custom domain | None configured in repository | None configured in repository | None configured in repository | If introduced, record provider-issued CNAME, verification records and exact callback URI here |
| Marketing media | `media.copacker.ai` | `media.copacker.ai` | `media.copacker.ai` | Existing shared public R2 assets |
| Turbo remote cache | `turbo.copacker.ai` | `turbo.copacker.ai` in CI | `turbo.copacker.ai` in CI | Existing Cloudflare service; not a browser OAuth origin |
| Email sender domain | `resend.dev` | `resend.dev` | `copacker.ai` | Existing Resend setup; dev/staging restricted to account owner |
| Database | Local Docker loopback | Neon staging branch | Neon production branch | Separate Hyperdrive configurations, verified TLS and caching off; retained Node executor uses the pooled Neon endpoint |
| Document storage | Native local R2 emulator | `copacker-staging-private` | `copacker-production-private` | Private R2 bindings in web Workers; bucket-scoped S3 credentials in the retained executor. No public document origin |
| Shopify events | Fixtures or owned development EventBridge/SQS resources | Staging EventBridge/SQS | Production EventBridge/SQS | No Copacker HTTP webhook hostname |
| Amazon notifications | Fixtures or owned development SQS resources | Staging SQS | Production SQS | No HTTP webhook hostname |
| Observability | `us.cloud.langfuse.com` when configured | `LANGFUSE_BASE_URL` | `LANGFUSE_BASE_URL` | Separate project keys; exact deployed endpoints must be read from service configuration |

## Local addresses

| Purpose | Primary checkout | Linked worktree | Required? |
| --- | --- | --- | --- |
| App and API | `local.copacker.ai` | `<worktree>.local.copacker.ai` | Yes |
| Storybook | `stories.local.copacker.ai` | `<worktree>.stories.local.copacker.ai` | When running Storybook |
| Dedicated E2E server | `e2e.local.copacker.ai` | `<worktree>.e2e.local.copacker.ai` | Copacker currently chooses an independent test server; neither Playwright nor Buildkit requires this domain |
| App auth callback | `local.copacker.ai/callback` | `<worktree>.local.copacker.ai/callback` | Path on the app; no separate auth server/domain |
| E2E auth callback | `e2e.local.copacker.ai/callback` | `<worktree>.e2e.local.copacker.ai/callback` | Only when the dedicated E2E server uses live auth |
| Local webhook handler | `local.copacker.ai/api/webhooks/<provider>` | `<worktree>.local.copacker.ai/api/webhooks/<provider>` | Path on the app; only providers with implemented handlers |

Auth and webhooks do not require additional local servers. Local app origins resolve to loopback, so external webhook
senders need a public tunnel or receiver outside the loopback namespace. Use a tunnel-issued URL or an owned public
hostname with its own DNS and TLS; no extra local webhook subdomain is configured. Use one owned tunnel per destination.
A dedicated E2E process isolates its lifecycle and build output, not its database or storage.

### Primary-checkout activation checklist

| Service | Change | Current status |
| --- | --- | --- |
| Launcher and Buildkit | Primary app has no `main` prefix; linked worktrees use readable folder names; collisions fail visibly | Implemented with published `@buildkitgg/dev-domains@0.1.0` |
| Shared Portless proxy | Register complete Copacker hostnames on the existing HTTPS proxy at port 443 | Buildkit 0.1.0 supports exact routes independently of startup suffixes; no restart required. Trusted HTTPS and independent cleanup verified alongside Spawn |
| Cloudflare DNS | Add DNS-only A `local.copacker.ai` → `127.0.0.1`, TTL 300; retain `*.local.copacker.ai` | Base record absent when inspected; pending |
| WorkOS redirects/logout | Add exact primary `https://local.copacker.ai/callback` and logout origin; optional exact E2E equivalents; retain existing entries and production defaults | Read-only inventory verified; no changes saved. Redirect dry-run rejected an existing URI ID and needs dashboard follow-up |
| Google Maps local key | Include exact `https://local.copacker.ai/*` alongside worktree wildcard; verify API restrictions and optional E2E scope | Pending inspection/update |
| Google through WorkOS | Keep the existing Google → WorkOS callback | No upstream change; test WorkOS → primary app after activation |
| Amazon Ads relay | Add exact `https://local.copacker.ai` to `AMAZON_ADS_RELAY_ORIGINS` on the primary app and staging relay; retain the worktree pattern; deploy readable-name validation to the relay | Code updated; environment variables and deployment pending |
| eBay local RuName | Change accepted URL to `https://local.copacker.ai/api/connections/ebay`, declined URL to `https://local.copacker.ai/settings#integrations` | Existing registration still targets `main.local.copacker.ai`; pending portal update |
| Other direct OAuth integrations | Register each exact new callback shown by the app before enabling the integration | Per-integration opt-in; no wildcard assumption |
| Webhooks | Keep app handlers; if enabled, point an owned public tunnel at them and set `WEBHOOK_BASE_URL` | Optional; hosted receiver remains deferred |
| Database/storage | None for this naming change | Migration and preview resources remain deferred |

The snapshot below records the earlier rollout. It does not certify activation of the newer names above.

## Verified rollout state (2026-10-14)

| Configuration | Applied or verified | Remaining action |
| --- | --- | --- |
| Local DNS | DNS-only `*.local.copacker.ai` A `127.0.0.1`, TTL 300; superseded loopback `*.dev.copacker.ai` removed | Each workstation runs `dev:setup` to trust its own CA |
| WorkOS | Shared staging environment `environment_01M4WPTJSA2ZFN09BWQV4TRCBM`, client `client_01M4WPTK4JK0HKFZA7ZSMQBVYD`; callback and logout patterns for `*.local.copacker.ai` and `*.e2e.local.copacker.ai` registered; CI callback `http://127.0.0.1:3005/callback` and logout origin `http://127.0.0.1:3005` registered after the real logout test exposed fallback to production | Existing production defaults and seven prior entries retained; user confirmed shared staging identity environment remains intentional. Defer identity separation to its own migration |
| Google through WorkOS | Exact upstream callback `https://auth.workos.com/sso/oauth/google/ZJwDwrWpf95iyqVRUkav8qCXh/callback`; client `924102076286-9r1dtjbjfcqa5voasq6dltct4bmg5mq2.apps.googleusercontent.com`; local Google sign-in reaches account selection; password sign-in and logout return to the exact local origin in E2E acceptance | No upstream callback change required for local rename; full Google sign-in returned to staging onboarding and sign-out completed in browser acceptance |
| Google Maps restrictions | Saved and verified `https://*.local.copacker.ai/*`; existing seven website restrictions and Maps JavaScript API / Places API (New) restrictions preserved | Three restricted replacement keys are configured and verified below; shared key retained during local-checkout cutover |
| Railway Storybook | Service `58c521b0-9266-4ea4-94e1-c35066b13903` (`copacker-stories`) in project `d8195bc8-1e6d-4fd6-b7bc-8ecf9852acd6`; Docker build, port 8080, `/health` configured | Both deployments successful; HTTPS health metadata matches deployed app commits; browser manager and preview checked |
| Storybook DNS | DNS-only staging CNAME `g96mxser.up.railway.app`; production CNAME `8sryyhn2.up.railway.app`; Railway-issued verification TXT records created | Railway manages public certificates |
| GitHub merge enforcement | CI publishes the aggregate `ci-ok` check | The current private-repository plan rejects branch-protection access; require `ci-ok` in branch protection after a plan upgrade. Until then, check it before merging |
| Public development hooks | No default subdomain; loopback is rejected as an eBay notification destination | Create an owned tunnel/receiver and dedicated provider resources before setting `WEBHOOK_BASE_URL` |
| eBay local OAuth (2026-10-15) | Main checkout RuName `Andrew_Craswell-AndrewCr-Copack-kmslwycva` maps to `https://main.local.copacker.ai/api/connections/ebay`; local `.env` selects it | Each additional worktree needs its own exact callback registration; see [eBay configuration](notifications.md#keys-and-signing-in) |
| Other integration dashboards | Exact callback changes are specified in the register below | Shopify, Amazon and eBay local callbacks are opt-in per integration worktree; not automatically registered |

The initial Storybook deployments use each environment's currently deployed application source: staging
`c651bdcd16d6fadb198b86041cd3e2cd04d8dec6`, production `a09712165d84fa3340d2c80aa2e7bafc0a382917`,
plus the static hosting files from this rollout. Subsequent releases build app and Storybook from the same release. The first full promotion passed staging E2E and production smoke checks; both apps and both Storybooks reported `cdef1f935b1d12e068c73ff0444c869046db2710`.

## Maps key separation

Three replacement keys were created on 2026-10-14 after enabling Maps JavaScript API in Google Cloud project
`copacker`. Each permits only Maps JavaScript API and Places API (New), with these website restrictions:

| Key name / resource ID | Allowed website referrers | Configuration destination |
| --- | --- | --- |
| Copacker Maps Local / `f2ae7042-d129-4240-8a95-941b9aaffed8` | `https://*.local.copacker.ai/*`, `http://localhost:3000/*`, `http://localhost:3001/*`, `http://localhost:3010/*` | Primary checkout's ignored `.env`: `VITE_GOOGLE_MAPS_API_KEY`; refresh other checkouts from this local key |
| Copacker Maps Staging / `3d77cae0-0fa1-45ec-b7bc-b497e78e29e2` | `https://staging.copacker.ai/*`, `https://copacker-staging.up.railway.app/*` | GitHub staging `GOOGLE_MAPS_BROWSER_KEY`, embedded as `VITE_GOOGLE_MAPS_API_KEY`; retained Railway rollback artifact |
| Copacker Maps Production / `a27495ad-bfea-47f8-9039-035aafe04285` | `https://copacker.ai/*`, `https://copacker-production.up.railway.app/*` | GitHub production `GOOGLE_MAPS_BROWSER_KEY`, embedded as `VITE_GOOGLE_MAPS_API_KEY`; retained Railway rollback artifact |

The Cloudflare release embeds the environment's restricted browser key during its web build. Do not add these keys to
the background executor or fixture Storybook previews.
Address autocomplete uses the key embedded in each environment's web build.
The Maps loader resolves only after SDK initialization, including the first mount. Preserve that readiness contract
when changing the script loading mode.

Acceptance: Places Autocomplete (New) returned HTTP 200 with suggestions for each key's intended referrer
(`main.local.copacker.ai`, `staging.copacker.ai`, `copacker.ai`). All three returned HTTP 403 with
`API_KEY_HTTP_REFERRER_BLOCKED` for `https://example.org/`. These are API restriction checks, not a substitute for
browser acceptance of address autocomplete in each environment. Railway variable values were compared without logging secrets.
Browser acceptance must start from a fresh document: open the address step once, search, select a result, and verify
street, city, region, postal code and country. Reopening the step can hide an SDK initialization race. Staging selection
filled these fields from a live Google result; the unsaved onboarding draft was discarded. After correcting the loading
mode, a fresh local document enabled search on its first address-dialog mount and filled the same fields. Keyboard
suggestions and the mobile dialog were checked, and the test address was cancelled without saving.

The previous shared key (`829033b6-204a-48a7-9e52-fda3b6226976`) remains active. Retire it only after active local
checkouts refresh their ignored environment configuration and the consuming UI passes browser acceptance.
Never record key values in Git or documentation.

## Webhook acceptance (2026-10-14)

Production eBay challenge verification matched the expected SHA-256 response using the configured token and exact
canonical endpoint. Unsigned notification requests were rejected with HTTP 412 in staging and production before
queue forwarding. Staging challenge verification returns HTTP 503 because notifications are not configured there.
WorkOS has no registered webhook endpoints or implemented handler; Shopify and Amazon use queues. No additional
public webhook endpoint is needed for fixture UX previews. Provision an owned local tunnel only for a specific
live integration task; never reuse another project's tunnel.

## Pull request previews

Trusted same-repository PRs receive an isolated Neon branch copied from staging, with the PR's migrations applied.
See [Neon previews](neon.md) for provisioning, expiry, cleanup, and secrets. Cloudflare hosting uses
`copacker-pr-<number>.hoa-preview.workers.dev` and `previews.copacker.ai/pr-<number>/storybook/`;
documents use only that PR's prefix in private R2. No new Railway preview infrastructure is created.

Automatic PR environment creation is disabled in both Copacker Railway projects. Existing fixture-only Storybook
previews for open PRs remain until those PRs close; they contain no application credentials. The
`pr-*.preview.copacker.ai` namespace remains reserved and is not provisioned. Before enabling Cloudflare previews,
register `https://copacker-pr-*.hoa-preview.workers.dev/callback` and the corresponding sign-out origin
`https://copacker-pr-*.hoa-preview.workers.dev` in the staging WorkOS environment. Preserve existing/default entries.
WorkOS supports prefixed subdomain wildcards; these patterns cover only this account's Copacker preview Workers.
They are shared configuration, not per-PR registrations. Do not add `*.up.railway.app` to any origin allowlist.

## Configuration change register

`A` means the exact application origin in the table above. Each usable alias needs its own entry where the provider
requires exact matching. `H` means the public webhook origin. Local `H` must never be a loopback app hostname.
“Register” below describes required external configuration, not a claim that a dashboard has already been updated.

| Service / owner | Setting and exact change | Development | Staging / production | Verification |
| --- | --- | --- | --- | --- |
| Portless / workstation | Pin `@buildkitgg/dev-domains@0.1.0` in Copacker; configure `dev-domains.config.ts`; complete Copacker hostnames, HTTPS port 443, loopback only, strict routes | Run `dev:setup`; trust CA; launcher disables hosts synchronization because wildcard DNS resolves loopback | Not installed in serving containers | `dev:status`, trusted HTTPS, Next and Storybook HMR |
| DNS / Cloudflare | DNS-only base `local.copacker.ai` and wildcard `*.local.copacker.ai` → `127.0.0.1`, TTL 300; never proxy loopback | Wildcard created 2026-10-14; local hosts entries are an alternative for networks blocking loopback DNS | Keep existing app records; add Storybook CNAME and Railway verification TXT per environment | DNS and Railway domain certificate status |
| TLS / workstation and Railway | Local Portless CA vs publicly trusted Railway certificates | Trust CA in OS and browser; Node child processes receive Portless CA | Public certificates on app and Storybook domains; nested staging Storybook requires certificate coverage | Browser without certificate bypass; HTTPS health request |
| Web runtime / Railway or launcher | `APP_URL=A`, `APP_ALIAS_URLS` contains only intentional aliases | Launcher overrides stale `.env` origins; no sibling worktree aliases | Web and worker use same environment's canonical origin | Generated email URLs, metadata and origin checks |
| AuthKit / runtime | `WORKOS_REDIRECT_URI=A/callback`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`; no parent-domain cookie | Launcher sets callback and clears `WORKOS_COOKIE_DOMAIN` | Set environment-scoped credentials; audit build-time values as well as runtime | Sign-in round trip and isolated session cookies |
| WorkOS / dashboard Redirects | Add `https://local.copacker.ai/callback` and `https://*.local.copacker.ai/callback`; optional E2E `https://e2e.local.copacker.ai/callback` and `https://*.e2e.local.copacker.ai/callback`; retain existing exact redirects | Default must be exact, e.g. `https://local.copacker.ai/callback`; do not change shared default blindly | Register `A/callback` and each active alias callback | Google/Microsoft/SSO return to starting origin; invalid sibling service callback rejected |
| WorkOS / logout and email flows | Register sign-out destinations `A`; configure initiate-login `A/login`, reset `A/reset-password`, invitation `A/signup` | Test wildcard support separately for sign-out; enumerate exact origins if necessary. Application-generated links use launcher's `APP_URL` | Shared initiate-login and invitation settings point to production; dashboard reset URL is unset, and app reset links use APP_URL. Environment split remains deferred | Logout, invitation resume, reset and verification emails |
| Google OAuth / Google Cloud and WorkOS | Authorized redirect URI is the exact URI copied from WorkOS Google provider settings; client ID/secret are stored in WorkOS | Current shared Google client is in Testing; manage test-user access | Publish/verify branding as appropriate; separate provider credentials when environments split | Google → WorkOS → originating app; no `redirect_uri_mismatch` |
| Google consent / Google Cloud | Branding homepage/privacy/terms, authorized domains and ownership verification, audience/test users, scopes | Keep test audience explicit; record scope additions | `https://copacker.ai`, `/privacy`, `/terms`; verify controlled domains when required | Consent screen, test-user access and verification status |
| Google direct OAuth / future integrations | Exact redirect URIs and, if browser OAuth is used, exact authorized JavaScript origins; no wildcard redirects | Preregister a bounded set of integration origins or register each exact worktree | Register exact staging/production and intended aliases | OAuth state/PKCE and matching token-exchange redirect |
| Google Maps/Places / Google Cloud | Separate `VITE_GOOGLE_MAPS_API_KEY` per environment; API restrictions: Maps JavaScript API and Places API (New) | Website restrictions `https://local.copacker.ai/*` and `https://*.local.copacker.ai/*`; add origin-only patterns if required by console/browser behavior; test E2E scope only when live APIs needed | `https://staging.copacker.ai/*`, `https://copacker.ai/*` on their respective keys; add exact aliases only when used | Autocomplete works on intended origins; unauthorized origin rejected; billing/quota enabled |
| Google Maps/Places / build pipeline | Browser key must exist before `next build`; Docker accepts `VITE_GOOGLE_MAPS_API_KEY` as a build argument and exposes it to the build | Loaded from local `.env` | Railway web service build variable per environment; rebuild after key changes | Inspect browser network for successful Places calls, without logging keys |
| Microsoft OAuth / Microsoft and WorkOS | Exact upstream redirect URI supplied by auth provider, credentials, tenant/audience/scopes | Current WorkOS environment uses demo credentials | Own provider app when moving to production auth environment | Microsoft login and tenant restrictions |
| Shopify / Dev Dashboard | App URL `A`; allowed redirect `A/api/connections/shopify`; scopes; app client ID/secret | Register exact local worktree callbacks in Copacker Dev; no automatic dashboard mutation | Development app for staging, production app for production; `shopify.app.toml` configures production only | Connect and reconnect return to same origin |
| Amazon SP-API / Solution Provider Portal | Exact callback `A/api/connections/amazon`; `AMAZON_APPLICATION_ID`, client credentials, draft setting | Self-authorization remains available; register exact local HTTPS callback if exercising public OAuth | Separate Aisle Dev / Aisle configuration | Seller consent, state and token exchange |
| Amazon Ads / Login with Amazon | Production callback `A/api/connections/amazon-ads`; development relay uses registered staging callback and `AMAZON_ADS_RELAY_URL`, `AMAZON_ADS_RELAY_SECRET`, `AMAZON_ADS_RELAY_ORIGINS` | Signed return routing to allowed worktree/app-preview origins; see [relay configuration](amazon-ads.md#shared-development-callback). Storybook excluded | Deploy relay-aware staging handler before enabling clients; production remains direct | Signed state, expiry, original user/workspace/seller, replay rejection, matching token-exchange redirect |
| eBay OAuth / Developer Portal | `EBAY_RU_NAME` maps to accepted callback `A/api/connections/ebay`; App ID and Cert ID | Dedicated RuName/test app per owned integration slot; never overwrite another's return URL | Environment-specific RuName and app credentials | Connect/cancel returns correctly |
| eBay notifications / portal and runtime | `WEBHOOK_BASE_URL=H`; endpoint `H/api/webhooks/ebay`; matching `EBAY_VERIFICATION_TOKEN`; event destination/subscriptions | Unset disables local subscription. Public slot plus dedicated provider resources required | Defaults to `APP_URL` if unset; web and worker must agree on endpoint | Endpoint challenge hash, signatures, deduplication and retries |
| WorkOS webhooks / dashboard, if added | Public HTTPS endpoint, event selection, endpoint signing secret and environment ownership | Dedicated public slot or replay fixtures; no local app DNS | Register actual handler only when implemented; no handler is introduced by Portless | Signed test event reaches correct environment once |
| Shopify/Amazon/eBay queues / AWS | EventBridge source/rules, SQS URL/policy/DLQ, IAM credentials, subscriptions | Leave deployment queues unset; owned test resources only | Keep separate staging/production queues from notifications doc | No worktree consumes another environment's events |
| Storybook / Railway | `copacker-stories` service; `Dockerfile.storybook`; port 8080; healthcheck `/health`, release metadata `/health.json`; `APP_COMMIT_SHA` at build; no app secrets or migrations | Local Storybook keeps mocks on its own origin | Static build from same release commit; Cloudflare DNS points to each environment's service | Manager, iframe, assets, mock worker and reported commit |
| Release workflow / GitHub | Deploy Storybook alongside web/worker; verify `health.json`; keep staging and production Storybook URLs explicit | Local build acceptance | Staging after checks; production promotion uses tested staging commit | Both app and Storybook report expected commit |
| Storage / bucket provider | `S3_ENDPOINT`, bucket, credentials, CORS if browser accesses bucket directly | Dedicated test bucket/prefix | Environment-specific buckets; update CORS for any new direct-upload origins | Upload/download and forbidden-origin behavior |
| Email / Resend | Sender domain verification, `EMAIL_FROM`, API key; generated links use `APP_URL` | Links work only on originating machine for local hostnames | Preserve production SPF/DKIM/DMARC; no need for sender domain per worktree | Reset/invitation URL and delivery |
| Test and data ownership / developer | Local database, S3 mock, test identities, workers and output directories | Separate dataset per concurrent worktree; one active E2E run per checkout; `.next-e2e` separate from `.next` | CI jobs isolated; staging seeds are destructive only to designated test workspaces | Concurrent runs do not reset each other's data |

Google API-key wildcards and WorkOS redirect wildcards have different semantics. A WorkOS wildcard covers one
leftmost label: `*.local.copacker.ai` does not cover `x.stories.local.copacker.ai`. Never add Storybook to app auth redirects.
Google's browser-key domain restriction is not an authentication boundary between sibling worktrees.

## Adding or replacing providers

| Change | Required inventory and implementation updates | Acceptance before removing old configuration |
| --- | --- | --- |
| WorkOS → Clerk or another identity provider | Create environment instances and record IDs; provider SDK/runtime and public build variables; session/proxy and cookie contracts; sign-in/signup/logout/callback routes; external Google/Microsoft/GitHub OAuth apps and exact upstream callback URIs; allowed origins and redirects; reset/verification/invitation links; user/organization ID mapping; memberships, roles and feature flags; test-user provisioning; webhook handlers/secrets/subscriptions; dashboard settings, CI/Railway secrets and this table | Explicit user/organization migration plan, existing-account continuity, all login methods, logout, invitation/reset flows, cross-worktree isolation, signed webhook replay, rollback window |
| Add GitHub or another social login | Decide brokered vs direct OAuth; create provider app(s); copy callback from chosen auth provider for brokered login; register exact app callback for direct login; configure credentials/scopes/audience; add provider enum/button/route/stories/tests and account-linking rules; update environment matrix | Sign-in, denied consent, missing/unverified email, existing account linking, correct return origin; do not assume Google wildcard or multi-callback rules apply |
| Add a webhook | Record source, receiving environment, public hostname/path, DNS/TLS/tunnel owner, subscription events/version, secret location, raw-body verification, replay tolerance, idempotency key, queue/DLQ, retry/retention and teardown procedure | Real signed test, invalid signature rejected, retry/deduplication and offline recovery; ensure no shared mutable provider destination is stolen by another slot |
| Rename/add a domain | DNS/TLS, Portless naming, app/alias URLs, Next/Vite hosts, cookies, all OAuth callback/logout/email URLs, API-key restrictions, bucket CORS, webhook endpoints/challenges, GitHub variables/healthchecks and documentation | Both environments and browser callbacks tested before old records/redirects are removed |

Do not change production user IDs or shared WorkOS settings as a side effect of a local hostname migration. Exact
provider-issued URLs and identifiers belong here after they have been inspected; secret values stay in secret stores.

## References

- [Portless](https://github.com/vercel-labs/portless)
- [WorkOS redirect URI rules](https://workos.com/docs/sso/redirect-uris)
- [WorkOS Google OAuth configuration](https://workos.com/docs/integrations/google-oauth)
- [Google OAuth redirect validation](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google API-key restrictions](https://docs.cloud.google.com/docs/authentication/api-keys)
- [WorkOS public webhook requirements](https://workos.com/docs/events/data-syncing/webhooks)
