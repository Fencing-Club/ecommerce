# Domains and provider configuration

This is the configuration inventory for local development, staging and production. Update it in the same change as
any hostname, authentication provider, integration callback or webhook. Never put credentials in this document.
Local launchers implement the development addresses; provider registrations and public DNS are separate changes.
See [local development](development.md) for commands and [operations](operations.md) for releases.

## Environment addresses

All addresses below use HTTPS unless explicitly stated. `<worktree>` is `main` for the primary checkout, otherwise
the directory slug plus an eight-character hash of its canonical path. `pnpm --filter copacker dev:urls` prints exact
addresses. Branch changes do not change them. There is deliberately no `app` label before `local.copacker.ai`.

| Surface | Development | Staging | Production | Configuration / status |
| --- | --- | --- | --- | --- |
| Application and API | `<worktree>.local.copacker.ai` | `staging.copacker.ai` | `copacker.ai` | Local: Portless. Deployed: Railway web service and Cloudflare DNS; existing app domains |
| Storybook | `<worktree>.stories.local.copacker.ai` | `stories.staging.copacker.ai` | `stories.copacker.ai` | Local: Portless. Deployed: separate `copacker-stories` static service; provisioned with this rollout |
| E2E target | `<worktree>.e2e.local.copacker.ai` | `staging.copacker.ai` | `copacker.ai` | Dedicated local process; full staging suite; production read-only smoke suite |
| CI E2E target | `http://127.0.0.1:3005` inside each isolated CI job | Not applicable | Not applicable | No public DNS or local CA in CI |
| Railway application alias | None | `copacker-staging.up.railway.app` | `copacker-production.up.railway.app` | Existing aliases; keep callbacks/origin restrictions while aliases remain usable |
| Public webhook integration slot | `<slot>.hooks.dev.copacker.ai` | Application origin | Application origin | Development slot is reserved, not provisioned automatically. Requires public tunnel/receiver and explicit owner |
| WorkOS-to-app callback | App origin + `/callback` | App origin + `/callback` | App origin + `/callback` | Different from Google's callback into WorkOS |
| Google/Microsoft-to-auth-provider callback | Exact URI shown in WorkOS provider settings | Exact URI shown in WorkOS provider settings | Exact URI shown in WorkOS provider settings | Currently shared WorkOS staging environment; no invented `auth.copacker.ai` hostname |
| Auth-provider custom domain | None configured in repository | None configured in repository | None configured in repository | If introduced, record provider-issued CNAME, verification records and exact callback URI here |
| Marketing media | `media.copacker.ai` | `media.copacker.ai` | `media.copacker.ai` | Existing shared public R2 assets |
| Turbo remote cache | `turbo.copacker.ai` | `turbo.copacker.ai` in CI | `turbo.copacker.ai` in CI | Existing Cloudflare service; not a browser OAuth origin |
| Email sender domain | `resend.dev` | `resend.dev` | `copacker.ai` | Existing Resend setup; dev/staging restricted to account owner |
| Database | Local Docker loopback | Railway private Postgres | Railway private Postgres | No public browser hostname; worktree data isolation must be configured explicitly |
| Document storage | Local mock or dedicated development bucket | Railway documents bucket | Separate Railway documents bucket | `S3_ENDPOINT` is provider-issued; do not invent a vanity domain |
| Shopify events | Fixtures or owned development EventBridge/SQS resources | Staging EventBridge/SQS | Production EventBridge/SQS | No Copacker HTTP webhook hostname |
| Amazon notifications | Fixtures or owned development SQS resources | Staging SQS | Production SQS | No HTTP webhook hostname |
| Observability | `us.cloud.langfuse.com` when configured | `LANGFUSE_BASE_URL` | `LANGFUSE_BASE_URL` | Separate project keys; exact deployed endpoints must be read from service configuration |

## Verified rollout state (2026-10-14)

| Configuration | Applied or verified | Remaining action |
| --- | --- | --- |
| Local DNS | DNS-only `*.local.copacker.ai` A `127.0.0.1`, TTL 300; superseded loopback `*.dev.copacker.ai` removed | Each workstation runs `dev:setup` to trust its own CA |
| WorkOS | Shared staging environment `environment_01M4WPTJSA2ZFN09BWQV4TRCBM`, client `client_01M4WPTK4JK0HKFZA7ZSMQBVYD`; callback and logout patterns for `*.local.copacker.ai` and `*.e2e.local.copacker.ai` registered; CI callback `http://127.0.0.1:3005/callback` and logout origin `http://127.0.0.1:3005` registered after the real logout test exposed fallback to production | Existing production defaults and seven prior entries retained; separate identity environments require their own migration |
| Google through WorkOS | Exact upstream callback `https://auth.workos.com/sso/oauth/google/ZJwDwrWpf95iyqVRUkav8qCXh/callback`; client `924102076286-9r1dtjbjfcqa5voasq6dltct4bmg5mq2.apps.googleusercontent.com`; local Google sign-in reaches account selection; password sign-in and logout return to the exact local origin in E2E acceptance | No upstream callback change required for local rename; Google account consent/return still needs interactive verification |
| Google Maps restrictions | Saved and verified `https://*.local.copacker.ai/*`; existing seven website restrictions and Maps JavaScript API / Places API (New) restrictions preserved | The current key is shared across environments; separate keys remain planned |
| Railway Storybook | Service `58c521b0-9266-4ea4-94e1-c35066b13903` (`copacker-stories`) in project `d8195bc8-1e6d-4fd6-b7bc-8ecf9852acd6`; Docker build, port 8080, `/health` configured | Both deployments successful; HTTPS health metadata matches deployed app commits; browser manager and preview checked |
| Storybook DNS | DNS-only staging CNAME `g96mxser.up.railway.app`; production CNAME `8sryyhn2.up.railway.app`; Railway-issued verification TXT records created | Railway manages public certificates |
| GitHub merge enforcement | CI publishes the aggregate `ci-ok` check | The current private-repository plan rejects branch-protection access; require `ci-ok` in branch protection after a plan upgrade. Until then, check it before merging |
| Public development hooks | Namespace reserved only; loopback is rejected as an eBay notification destination | Create an owned tunnel/receiver and dedicated provider resources before setting `WEBHOOK_BASE_URL` |
| Other integration dashboards | Exact callback changes are specified in the register below | Shopify, Amazon and eBay local callbacks are opt-in per integration worktree; not automatically registered |

The initial Storybook deployments use each environment's currently deployed application source: staging
`c651bdcd16d6fadb198b86041cd3e2cd04d8dec6`, production `a09712165d84fa3340d2c80aa2e7bafc0a382917`,
plus the static hosting files from this rollout. Subsequent releases build app and Storybook from the same release.

## Pull request previews

Storybook previews run in the separate Railway project `copacker-storybook-previews`
(`16c32c30-7ae6-41c7-b3c9-896d0c4d3876`). Its `preview-base` environment
(`379f7435-fe02-47d2-8125-3bcb58a890e1`) contains only `copacker-stories`
(`4af6c3a1-6118-46c0-b434-de0deecf8185`), with no application secrets, database, bucket or worker.
PR deployments are enabled and the GitHub source follows `main`. PR #8 merged after all checks passed; its CI logout test now verifies the exact return origin.

Opening [PR #9](https://github.com/AndrewCraswell/ecommerce/pull/9) automatically created ephemeral environment
`ecommerce-pr-9` (`dfc03b53-5dcc-4f0d-ba00-b34cda91a67d`) and
`https://copacker-stories-ecommerce-pr-9.up.railway.app`. Its inventory contains one Storybook service, only
`PORT` / `RAILWAY_DOCKERFILE_PATH` variables, and no volumes or buckets. The PR records deployment and cleanup
acceptance evidence; its temporary address is not a permanent environment URL.

| Surface | Address and lifecycle | Configuration |
| --- | --- | --- |
| Preview base | `https://copacker-stories-preview-base.up.railway.app` | Tracks `main`; exists to supply the PR template |
| Storybook PR | Railway-issued `*.up.railway.app` URL shown on the PR deployment | Created per eligible repository PR, updated on pushes, removed on close/merge |
| UX preview | Page and component stories, with fixture data and mocked API responses | Review flows through Storybook; no connection to shared staging or production data |
| Database preview | Deferred until the Neon migration | Plan per-PR branches, sanitized seeds, credential isolation and deletion on PR close |
| Storage preview | Deferred until the Cloudflare storage migration | Plan isolated per-PR namespaces or buckets, scoped credentials and cleanup on PR close |
| Full data-backed app PR | Deferred with database and storage | Add real persistence and integration acceptance only after isolated resources are available |

Use the actual Railway-issued preview URL; `pr-123.stories.preview.copacker.ai` is not configured.
Generated domains give automatic HTTPS and cleanup without per-PR DNS records. They require no WorkOS, Google,
Shopify, Amazon or eBay callback entries because Storybook runs fixtures. Runtime is limited to 0.5 GB and one CPU,
with sleeping enabled. Railway restricts automatic PR deployment to recognized project/workspace contributors.
Health metadata uses `RAILWAY_GIT_COMMIT_SHA` for GitHub deployments; release CD supplies `APP_COMMIT_SHA` explicitly.
Do not enable app-project PR duplication from production: that would copy live integration configuration.

### Deferred persistence (decision: 2026-10-14)

Preview scope is Storybook and fixture-backed UX only. Do not provision a Railway database or storage bucket per PR,
run migrations/seeds against shared environments, or wire UX previews to staging/production persistence.
Database previews are deferred until the migration to Neon; storage previews are deferred until the migration to
Cloudflare. The intent is to make isolated preview resources simpler and cheaper to provision and remove. This is a
planned dependency, not a claim that either migration or preview resource automation has been completed.

Revisit full app previews after those migrations: define per-PR resource ownership and lifetime, sanitized fixture
seeding, least-privilege credentials, callback/origin registrations, cost limits, CI readiness checks and automatic
cleanup on PR close. Workers, real emails and external integration/webhook subscriptions remain disabled unless a
preview explicitly provisions dedicated test resources.

## Configuration change register

`A` means the exact application origin in the table above. Each usable alias needs its own entry where the provider
requires exact matching. `H` means the public webhook origin. Local `H` must never be a loopback app hostname.
“Register” below describes required external configuration, not a claim that a dashboard has already been updated.

| Service / owner | Setting and exact change | Development | Staging / production | Verification |
| --- | --- | --- | --- | --- |
| Portless / workstation | Pin `portless` in Copacker; proxy suffix `local.copacker.ai`, HTTPS port 443, loopback only, strict routes | Run `dev:setup`; trust CA; launcher disables hosts synchronization because wildcard DNS resolves loopback | Not installed in serving containers | `dev:status`, trusted HTTPS, Next and Storybook HMR |
| DNS / Cloudflare | DNS-only wildcard `*.local.copacker.ai` → `127.0.0.1`, TTL 300; public hooks use the separate `hooks.dev.copacker.ai` namespace; never proxy loopback | Wildcard created 2026-10-14; local hosts entries are an alternative for networks blocking loopback DNS | Keep existing app records; add Storybook CNAME and Railway verification TXT per environment | DNS and Railway domain certificate status |
| TLS / workstation and Railway | Local Portless CA vs publicly trusted Railway certificates | Trust CA in OS and browser; Node child processes receive Portless CA | Public certificates on app and Storybook domains; nested staging Storybook requires certificate coverage | Browser without certificate bypass; HTTPS health request |
| Web runtime / Railway or launcher | `APP_URL=A`, `APP_ALIAS_URLS` contains only intentional aliases | Launcher overrides stale `.env` origins; no sibling worktree aliases | Web and worker use same environment's canonical origin | Generated email URLs, metadata and origin checks |
| AuthKit / runtime | `NEXT_PUBLIC_WORKOS_REDIRECT_URI=A/callback`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`; no parent-domain cookie | Launcher sets callback and clears `WORKOS_COOKIE_DOMAIN` | Set environment-scoped credentials; audit build-time values as well as runtime | Sign-in round trip and isolated session cookies |
| WorkOS / dashboard Redirects | Add `https://*.local.copacker.ai/callback`; optional E2E `https://*.e2e.local.copacker.ai/callback`; retain existing exact redirects | Default must be exact, e.g. `https://main.local.copacker.ai/callback`; do not change shared default blindly | Register `A/callback` and each active alias callback | Google/Microsoft/SSO return to starting origin; invalid sibling service callback rejected |
| WorkOS / logout and email flows | Register sign-out destinations `A`; configure initiate-login `A/login`, reset `A/reset-password`, invitation `A/signup` | Test wildcard support separately for sign-out; enumerate exact origins if necessary. Application-generated links use launcher's `APP_URL` | Existing shared environment's reset/invitation settings point to production; environment split is a separate identity migration | Logout, invitation resume, reset and verification emails |
| Google OAuth / Google Cloud and WorkOS | Authorized redirect URI is the exact URI copied from WorkOS Google provider settings; client ID/secret are stored in WorkOS | Current shared Google client is in Testing; manage test-user access | Publish/verify branding as appropriate; separate provider credentials when environments split | Google → WorkOS → originating app; no `redirect_uri_mismatch` |
| Google consent / Google Cloud | Branding homepage/privacy/terms, authorized domains and ownership verification, audience/test users, scopes | Keep test audience explicit; record scope additions | `https://copacker.ai`, `/privacy`, `/terms`; verify controlled domains when required | Consent screen, test-user access and verification status |
| Google direct OAuth / future integrations | Exact redirect URIs and, if browser OAuth is used, exact authorized JavaScript origins; no wildcard redirects | Preregister a bounded set of integration origins or register each exact worktree | Register exact staging/production and intended aliases | OAuth state/PKCE and matching token-exchange redirect |
| Google Maps/Places / Google Cloud | Separate `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` per environment; API restrictions: Maps JavaScript API and Places API (New) | Website restrictions `https://*.local.copacker.ai/*`; add origin-only patterns if required by console/browser behavior; test E2E scope only when live APIs needed | `https://staging.copacker.ai/*`, `https://copacker.ai/*` on their respective keys; add exact aliases only when used | Autocomplete works on intended origins; unauthorized origin rejected; billing/quota enabled |
| Google Maps/Places / build pipeline | Browser key must exist before `next build`; `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` Docker build-argument wiring belongs to the separate address-autocomplete change and is not included in this rollout | Loaded from local `.env` | Railway web service build variable per environment; rebuild after key changes | Inspect browser network for successful Places calls, without logging keys |
| Microsoft OAuth / Microsoft and WorkOS | Exact upstream redirect URI supplied by auth provider, credentials, tenant/audience/scopes | Current WorkOS environment uses demo credentials | Own provider app when moving to production auth environment | Microsoft login and tenant restrictions |
| Shopify / Dev Dashboard | App URL `A`; allowed redirect `A/api/connections/shopify`; scopes; app client ID/secret | Register exact local worktree callbacks in Copacker Dev; no automatic dashboard mutation | Development app for staging, production app for production; `shopify.app.toml` configures production only | Connect and reconnect return to same origin |
| Amazon SP-API / Solution Provider Portal | Exact callback `A/api/connections/amazon`; `AMAZON_APPLICATION_ID`, client credentials, draft setting | Self-authorization remains available; register exact local HTTPS callback if exercising public OAuth | Separate Aisle Dev / Aisle configuration | Seller consent, state and token exchange |
| Amazon Ads / Login with Amazon | Allowed return URL `A/api/connections/amazon-ads`; `AMAZON_ADS_CLIENT_ID`, `AMAZON_ADS_CLIENT_SECRET` | Register exact integration worktree | Register exact environment callback | Consent and expense sync |
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
