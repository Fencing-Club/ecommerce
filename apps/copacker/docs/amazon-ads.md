# Amazon Ads expense reporting

Amazon Ads is authorized separately from SP-API. A buyer owner or admin connects it under Settings > Integrations > Advertising > Amazon Ads. Its own card shows the Ads connection status. Connect starts Amazon consent directly; a connected card opens the Ads
controls. Missing application credentials show a setup-required message instead of a Connect action. Store connections remain in the Stores group; without an Amazon store, the Ads card asks to connect one first.
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

## Import and expense calculation

Connection, Sync ad spend and daily reconciliation queue durable `amazon-ads` jobs. Each reads a rolling 90-day window
per profile through Reporting API v1. Profiles are matched to global advertiser accounts using `/adsAccounts/list`;
reports filter by campaign country and Sponsored Products, Sponsored Brands and Sponsored Display. Requested fields
include date, campaign ID, campaign country, ad product, budget currency and total cost. Report IDs survive worker restarts. Throttling and
temporary server failures are retried through the queue; permanent failures appear in Settings. Sync again retries
failed work. Amazon may revise recent spend, so repeated imports replace daily totals rather than adding them.

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
