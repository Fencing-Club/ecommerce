# Copacker marketplaces

Amazon, Shopify and eBay clients, sales collectors and Amazon report parsers for Copacker:
`@repo/copacker-marketplaces/<module>`. Orders live in [`@repo/copacker-orders`](../../copacker-orders/docs/README.md),
and packing and documents in [`@repo/copacker-shipments`](../../copacker-shipments/docs/README.md).

Connecting accounts: `./shopify-auth` exchanges and refreshes Shopify's OAuth tokens, uninstalls the app and checks
Shopify's callback signature (`verifyShopifyHmac`); `exchangeAmazonCode` in `./amazon` and `exchangeEbayCode` in
`./ebay` trade a seller's authorization code for a refresh token. `./shopify` stays free of Node APIs, as the browser
loads it for the shop-domain schema.

`./ebay-finances` validates bounded transaction/payout pages, excludes buyer/bank/memo fields and follows exact payout
references. It preserves net amounts and fee components separately. See [eBay financial evidence](../../../apps/copacker/docs/ebay-finances.md).

`./amazon-marketplaces` is the one table of the North American Amazon marketplaces Copacker reads (ID, country,
channel code, label, Seller Central host and order-report name), with `usMarketplaceId` for the US marketplace that
holds FBA and AWD stock, and `amazonConsentUrl` for Seller Central's authorization page. It has no Node dependencies,
so the browser can load it. `./amazon-ads` is the Amazon Ads API client: tokens, seller profiles, ad-spend reports and
their downloads, with the Ads app's credentials passed in. `AdsProfileError` distinguishes missing profiles, seller
and region mismatches, and missing or ambiguous advertiser-account mappings. These failures are raised before returning
profiles; the app owns credential-safe [callback diagnostics](../../../apps/copacker/docs/amazon-ads.md#connection-diagnostics).

`./sales` also counts an order's net product sales (`orderSales`), eBay's line and order refunds (`ebayLineSales`,
`ebayOrderRefund`) and Shopify Payments' fees on an order (`shopifyOrderFees`). Copacker's Overview repeats this math
in SQL (`apps/copacker/src/server/overview-sales.ts`); change both together.

Identifiers the app checks against are defined once here: a Shopify variant's ID (`variantIdSchema` in `/shopify`) and
an Amazon seller ID (`sellerIdSchema` in `/amazon`).

`./listing-writes` provides Amazon US listing discovery and narrow provider-write adapters using the existing clients.
Amazon price patches preserve other offer audiences; inventory patches address only DEFAULT merchant availability.
An ACCEPTED submission is not confirmation. Shopify inventory uses `changeFromQuantity` and an idempotency key on
the pinned 2026-07 API. These primitives are not public write handlers: the app must authorize and retain execution
before dispatch, then verify outcomes. Cost writes reuse `Shopify.unitCost`; SKU, price and compare-and-swap inventory
use the narrow listing adapters. Current values, identity and actual granted scopes are checked with `readShopifyWrite`.
See [CLI listing limits](../../../apps/copacker/docs/cli-listings.md) and
[execution and routing](../../../apps/copacker/docs/cli-provider-writes.md).

`@repo/copacker-marketplaces/returns` parses Amazon's FBA customer returns report with strict headers, quantities and timezone-bearing
timestamps, including quoted multiline TSV fields. It preserves source rows and unknown codes, omits customer comments,
and rejects malformed documents rather than silently dropping records. [Copacker's importer](../../../apps/copacker/docs/amazon-returns.md)
owns persistence, scope, monthly replacement and coverage.

`@repo/copacker-marketplaces/reimbursements` parses FBA reimbursement details using the same TSV reader. It retains exact signed decimal
amounts, separate cash/inventory quantities, missing values and original reimbursement references. It does not infer
financial postings or loss eligibility. See [reimbursement ingestion](../../../apps/copacker/docs/amazon-reimbursements.md).

`@repo/copacker-marketplaces/ledger-detail` parses all detailed-ledger events/dispositions, retaining signed quantities, source references,
reported calendar dates and raw source clock text. Missing optional values and unknown codes remain explicit. See
[movement ingestion](../../../apps/copacker/docs/amazon-inventory-movements.md); the existing summary-ledger parser
continues to supply stockout-day balances separately.

`@repo/copacker-marketplaces/storage-fees` parses monthly storage estimates and aged-inventory charges separately, retaining exact
decimals, calendar dates (including timezone-bearing aged-fee snapshots) and raw fee components without summing or inventing missing product mappings. See
[storage ingestion](../../../apps/copacker/docs/amazon-storage-fees.md).

`@repo/copacker-marketplaces/removals` parses removal orders and shipments with distinct quantities, exact fees and timezone-bearing
dates. It retains source codes and split shipments without assuming financial or inventory postings. See
[removal evidence](../../../apps/copacker/docs/amazon-removals.md).

`@repo/copacker-marketplaces/fulfillment-shipments` parses dated FBA shipment items with stable identities and an accounting-only field allowlist. Sales readers also retain Shopify fulfillment creation and in-transit times. See [shipment-date evidence](../../../apps/copacker/docs/shipment-date-evidence.md).

The shopify-economics collector reads bounded financial/return evidence independently of sales history; fbm-returns parses seller-fulfilled return reports without customer text, including unambiguous named-month dates and unavailable monetary placeholders. Invalid records expose field diagnostics and a masked date shape, never source values.

Each report parser module also exports the report type it reads (`fbaReturnsReportType`, `fbmReturnsReportType`,
`storageFeeReportTypes` and so on), so Copacker requests the report its parser expects.

Amazon report reads retry throttling with minute-scale backoff and retain the current report ID. Provider failures carry
a fixed operation name; FATAL processing outcomes are distinct from HTTP failures. Caller deadlines bound all retries. Opt-in reuse requires an exact report scope and a caller-defined creation-time cutoff, including the reimbursement daily-content refresh interval.
Copacker installs a durable creation policy shared across workers. It spaces new reports, observes rate-limit headers,
and persists per-type cooldowns after HTTP 429. Existing report lookup, polling and downloads remain available during
creation cooldown. A local deferral is distinct from an Amazon response. Standalone callers without that policy retain
bounded five- then ten-minute creation retries. The three-per-five-minute forum clarification originated with Sales and
Traffic; it is not proof of a universal FBA quota. See [report limits](../../../apps/copacker/docs/amazon-report-limits.md).

AWD shipment lists and receipt details also retry transient read failures with a five-minute bound and optional
ownership checks; neither path retries mutations or suppresses invalid documents.

## Commerce snapshots

Shopify stock always includes product identity and display fields. Shopify sales always include tags, line prices,
discount allocations and payment transactions. Readers validate those fields instead of accepting historical partial
shapes. Customer IDs remain permission-dependent; Amazon proceeds remain optional until Amazon prices an order.

Report recovery may explicitly opt into CANCELLED history as unavailable evidence. It never turns cancellation into an empty document; exact scope and creation cutoff still apply. See [aged-storage retry policy](../../../apps/copacker/docs/amazon-storage-fees.md#unavailable-aged-storage-months).
