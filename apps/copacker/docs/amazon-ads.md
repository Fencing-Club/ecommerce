# Amazon Ads expense reporting

Amazon Ads is authorized separately from SP-API. A buyer owner or admin connects it under Settings > Integrations > Advertising > Amazon Ads. Its card shows the linked store, connection status and sync activity. Connect starts Amazon consent directly; Manage opens the ad-spend sync and connection controls. Disconnect asks for confirmation and keeps previously imported expenses.
Store cards use the same Manage action. Shopify separates its name and domain; Amazon summarizes the marketplace count, with the full list in Manage. Management uses content-sized dialogs with account identity and connection status in the header, visible sync controls in a consistent two-column desktop grid (including single cards), grouped import preferences, and a separate footer for connection actions. Queued work is distinguished from running work; order-history progress is only shown while running. Ads includes a link to Overview, where the imported spend is used. Missing application credentials show a setup-required message instead of a Connect action. Store connections remain in the Stores group; without an Amazon store, the Ads card asks to connect one first.
Workspace members can read this status, while only owners and admins can change the connection.
The connected seller must already exist. OAuth state is single-use, expires after ten minutes, and is bound to
the workspace, user and seller. Only North American seller profiles matching that seller ID are imported; vendor,
agency and unrelated seller profiles are excluded. Refresh tokens are encrypted with workspace-specific associated
data. Reconnecting replaces the authorization generation so old jobs cannot write through it.

## Configuration

Set `AMAZON_ADS_CLIENT_ID` and `AMAZON_ADS_CLIENT_SECRET` on the web and worker services. These belong to the Login
with Amazon security profile approved for `advertising::campaign_management`, not the SP-API application. Register
`https://copacker.ai/api/connections/amazon-ads` as an allowed return URL. Development deployments need their own exact
return URL registered. No JavaScript origin is needed for the server-side authorization-code flow. Never commit tokens
or secrets. Amazon's scope permits campaign management, but Copacker only reads profiles and creates/downloads reports.

## Shared development callback

Local worktrees and trusted data-backed app previews can use the already registered staging callback:
`https://staging.copacker.ai/api/connections/amazon-ads`. Set `AMAZON_ADS_RELAY_URL` to that exact URL and
`AMAZON_ADS_RELAY_SECRET` to the same separately generated 32-byte base64 secret on staging and participating apps.
Set `AMAZON_ADS_RELAY_ORIGINS` on those apps and staging to a comma-separated list of permitted HTTPS origins.
The originating app and relay must use the same Amazon Ads client. Production leaves these settings blank and keeps
its existing direct callback. Partial or invalid relay configuration fails closed.

Register `https://local.copacker.ai` explicitly for the primary checkout.
The two supported patterns are `https://*.local.copacker.ai` (normalized worktree folder labels; excludes the reserved
`stories`, `e2e`, and `hooks` service labels) and `https://pr-*.preview.copacker.ai` (only positive numeric PR labels). The latter
is a reserved option for future app-preview hosting, not a provisioned DNS namespace. Railway-generated app preview
origins can instead be enrolled as exact origins by trusted deployment automation and removed on teardown. Never use
`*.up.railway.app`, give secrets to fork PRs, or add static Storybook previews. Current PR previews are Storybook-only;
data-backed app previews remain deferred until isolated database/storage provisioning exists.

Amazon sees one fixed callback. The originating app stores a hash of a signed ticket with its exact HTTPS origin,
nonce, callback and ten-minute expiry. Staging verifies its signature, expiry and destination allowlist before
forwarding only the state and code or denial through the browser. It needs no originating session or database, does
not exchange the code, and never stores the grant. Responses are non-cacheable and suppress the Referer header.
The originating app verifies the exact return origin and its existing single-use user/workspace/seller state, then
exchanges the code using the same staging redirect URI. Its host-only cookies and database remain isolated. No
server fetch to loopback or preview addresses is involved. Replays fail at the originating app; deny/cancel follows
the same relay. Normal staging connections continue directly.

Rollout: deploy the relay-aware handler to staging before setting these variables on development clients. Register
only the shared staging callback with Amazon (already present), launch local apps with `pnpm dev` through Portless,
and verify consent and denial return to the starting worktree. Do not add port-based localhost callbacks or change
`APP_URL` to staging. A relay under maintenance or unavailable stops authorization; it never falls back to a different
callback. Rotate the relay secret on every participating app if a trusted preview is compromised.

## Import and expense calculation

Connection, Sync ad spend and daily reconciliation queue durable `amazon-ads` jobs. Each reads a rolling 90-day window
per profile through Reporting API v1. Profiles are matched to global advertiser accounts using `/adsAccounts/list`;
reports filter by campaign country and Sponsored Products, Sponsored Brands and Sponsored Display. Requested fields
include date, campaign ID, campaign country, ad product, budget currency and total cost. Report IDs survive worker restarts. Throttling and
temporary server failures are retried through the queue; permanent failures appear in Settings. Sync again retries
failed work. Amazon may revise recent spend, so repeated imports replace daily totals rather than adding them.

Amazon can return null report parts and warnings while reports are pending or processing. The collector accepts
these absent values, saves the report ID and keeps polling. A completed report still requires download parts, and
nonempty warnings still reject the report without overwriting stored spend.

All report parts must complete before any days in a window are stored in `amazon_ads_days`. Reports with warnings,
missing costs, unexpected countries or currencies are rejected instead of counted as complete. Empty completed reports
produce zero-spend days. Downloads are size-limited, use only Amazon S3 HTTPS URLs, and receive no authorization headers.
Foreign currency spend uses the existing daily exchange rates.

For a selected Overview period, daily Ads spend replaces `ProductAdsPayment` only if every applicable profile covers
every requested calendar day and all currency rates exist. Otherwise the entire period retains the existing posted
payment basis. The two sources are never added together. Amazon aggregates by campaign time zone, and the selected
period uses the corresponding country profile's time zone;
boundary days are whole days because Amazon reports no finer time detail. Today's spend is provisional. Reporting
costs are not invoices: taxes, credits and billing adjustments can differ from cash payments. DSP is not included.

Disconnecting removes the grant and stops its jobs; Overview returns to posted payments. Stored daily totals remain
for reconnecting the same seller. Deleting the workspace removes grants, jobs and daily totals.

## References

- [Amazon Ads authorization](https://advertising.amazon.com/API/docs/en-us/guides/account-management/authorization/authorization-grants)
- [Reporting API v1](https://advertising.amazon.com/API/docs/en-us/guides/reporting/ads-v1/quickstart)
- [Dates and history](https://advertising.amazon.com/API/docs/en-us/guides/reporting/ads-v1/dates)
- [Profiles](https://advertising.amazon.com/API/docs/en-us/reference/2/profiles)

Scope validation failures identify the mismatched field (date, country, currency or ad product) without logging
source values or campaign identifiers. Rejected reports do not publish spend or product evidence.

Report output labels (`Sponsored Products`, `Sponsored Brands`, `Sponsored Display`) are normalized to the internal
uppercase ad-product identifiers. Request filters retain the API enum values. Unknown labels remain unsupported and
fail scope validation; normalization does not admit DSP or weaken date, country or currency checks.
