# Analytics data backlog

Data acquisition for [P0 analytics](README.md) takes priority over additional analytics screens. This backlog covers
profitability, historical COGS, returns, reimbursements and Shopify reporting only. It does not assess overall app,
deployment, integration-sync or release readiness.

Baseline: repository audit on 2026-10-16, not a production
account audit. Completed implementation tasks are checked below; broader data-readiness items remain open where their
acceptance evidence is incomplete. Proposed sources require
account-level permission, availability and retention checks; do not treat a source candidate as a verified integration.

## Completed implementation

Done in the analytics worktree, verified locally; deployment and live-account acceptance are separate tasks.

- [x] Add the read-only Amazon financial audit command and document the stored-evidence baseline.
- [x] A01: implement US FBA returns ingestion.
- [x] A02: implement detailed US FBA inventory movement ingestion.
- [x] A03: implement US FBA reimbursement ingestion.
- [x] A04: implement monthly storage estimates and aged-inventory charge ingestion.
- [x] A05: implement removal/disposal order and shipment evidence ingestion.
- [x] Add monthly backfill, refresh, repeat-safe replacement and coverage status for these report feeds.
- [x] Expose reconciliation evidence, current product matches, financial candidates and transaction arithmetic checks.
- [x] D05: implement explicit dated product mappings, overlap protection, corrections and retirement audit history.
- [x] Allocate supported Amazon item amounts and recognized fees to mapped products; expose unallocated balances.
- [x] Establish `/api/analytics/amazon` resource URLs, individual mapping reads/retirement and creation Location headers.
- [x] Standardize analytics JSON errors, authentication responses and safe creation retries.
- [x] Bound collection pagination and reject continuation when source data changes.
- [x] Document the [analytics HTTP contract](../../analytics-api.md); pass 39 focused tests and full `pnpm verify` after the API cleanup.

- [x] D01: add immutable dated purchase-cost records from manual evidence or scoped PO revision snapshots.
- [x] D02: add opening quantities and actual/estimated/unknown values by product/location.
- [x] D03: add item receipt records with dates, conditions, partial quantities and purchase links.
- [x] Add audited corrections, repeat-safe creation, duplicate-source checks and concurrent receipt quantity limits for these inputs.

- [x] D04: allocate historical landed bills and credits, including frozen PO charge imports and audited corrections.
- [x] Calculate FIFO over explicit depletion records, with opening cutover, exact receipt allocation and unresolved-cost states.

See [historical inventory cost inputs](../../historical-inventory-basis.md). D01-D03 remain partial: entry/import screens,
provider receipt reconciliation, opening lots and broader movements are not complete. [Landed costs and FIFO](../../inventory-costing.md) are implemented
for recorded evidence; automatic sale conversion is implemented for supported evidenced shipments; FX policy and return-to-stock accounting remain open.

- [x] Import source-linked Shopify fulfillment lines and evidenced US Amazon FBA shipments into FIFO, with duplicate/quantity checks and stale-evidence blocking.

See [sales-linked FIFO imports](../../sales-cost-imports.md). Missing shipment timestamps or conversions require explicit merchant evidence. Supported unattended imports are implemented; returns restoration remains open.

- [x] Retain Shopify fulfillment/in-transit timestamps and trigger order history backfill.
- [x] Import monthly Amazon FBA shipment events with persistent request budgeting and independent coverage.
- [x] Derive depletion dates from matched provider evidence and reject contradictory dates.

See [shipment-date evidence](../../shipment-date-evidence.md); live coverage remains unverified; dated conversions and unattended depletion scheduling are implemented for supported shipments.

- [x] Add dated, audited homogeneous-unit conversions with explicit automatic-import opt-in.
- [x] Preserve stored order IDs during refresh and process supported shipments after sales sync with resumable checkpoints.
- [x] Report import gaps and audit automatic corrections while protecting manual/retired depletion evidence.

See [automatic depletion imports](../../automatic-depletion-imports.md). Live acceptance, heterogeneous bundles and return-to-stock accounting remain open.

## Expanded acquisition implementation

- [x] Add atomic historical inventory/landed-cost batches and audited merchant expense imports.
- [x] Validate cost batches through a rollback-only preview using the same rules as commit; preserve corrections and dependent rows without saving preview data.
- [x] Collect independent FBA/AWD inbound quantity snapshots.
- [x] Collect Shopify refund/payment/shipping evidence and permission-gated returns/exchanges/dispositions, using updated-order checkpoints.
- [x] Add FBM return reports, stored AWD finance evidence and a separate product advertising report stage.
- [x] Resume Shopify financial pages in an independent durable job; discover earliest accessible history with all-orders permission.
- [x] Backfill all missing FBM monthly windows and preserve prior coverage on failed refreshes.
- [x] Integrate analytics API handlers with TanStack Start and financial jobs with Cloudflare wake signals; no UX changes.

See [expanded ingestion](../../analytics-ingestion.md) for bounds, scopes and remaining acceptance. This delivery is ingestion-only. Spreadsheet uploads and all other UX work are deferred and are not ingestion release blockers. Automatic invoice matching, source reconciliation and live account validation remain open.

## Remaining acceptance for implemented work

- [x] Deploy the ingestion implementation and migrations (production release `02eeb1c`, 2026-10-17).
- [ ] Validate report formats, permissions, retention and coverage against a connected seller account.
- [ ] Validate financial classifications and allocation behavior against real-account evidence.
- [ ] Reconcile report records to financial postings, including reversals and duplicate-counting protection.
- [ ] Extend historical identity to unresolved order references, bundle relationships and batch requirements.
- [ ] Measure pagination fingerprint performance on large accounts before rollout.
- [ ] Build the customer-facing reporting and mapping workflows after their data dependencies are ready.

A01-A05 acquisition implementations are done; their end-to-end readiness is partial. D05 and D07 also have completed
subtasks, but their broader requirements below remain open. The checkboxes in the final readiness section are acceptance
criteria to apply per dataset/account/period, not a list of implementation tasks already completed.

## Existing data to reuse

| Input | Current baseline | Remaining work |
| --- | --- | --- |
| Amazon finances | Transaction payloads, totals, fee totals, posting dates and order references are retained | Classify fee/credit components, extract item references where supplied, reconcile and expose detail |
| Amazon inventory history | Daily sellable ending balances plus the newly implemented detailed US FBA movement feed | Validate live coverage, link product/receipt references and reconcile quantities; the original summary parser remains separate |
| PO and landed costs | Existing PO/landed charges plus new dated purchase-cost, opening-balance and receipt records | Reconcile receipts and import sales into the new landed-cost/FIFO calculation before replacing current profit calculations |
| Amazon advertising | Daily expense totals used by Overview | Product attribution and explicit shared spend |
| Shopify orders | Lines, discounts, quantities, fulfillment links and transaction fee information | Refund events, full payment amounts, returns and shipping economics |
| Shopify Payments balances | Balance transactions and raw payloads | Verify coverage and extract usable costs before adding another feed |
| Shopify customers | Optional customer IDs and repeat-customer calculations already exist | Check permissions, historical coverage and backfill; this is not a wholly missing integration |
| Sync coverage and FX | Existing source coverage records and exchange-rate conversion | Extend to each new dataset and financial event |

Evidence: [sales collectors](../../../../../packages/aisle/src/sales.ts),
[ledger parser](../../../../../packages/aisle/src/ledger.ts),
[stored records](../../../src/db/schema.ts), [profit calculations](../../../src/server/overview-sales.ts),
[landed costs](../../../src/server/landed-costs.ts), [Overview](../../overview.md),
[sales ingestion](../../sales-demand.md), and [Ads ingestion](../../amazon-ads.md).

The [reconciliation evidence endpoint](../../amazon-reconciliation.md) now exposes observed product identities,
financial candidates and independent transaction arithmetic checks. [Explicit dated mappings and direct financial item allocations](../../amazon-cost-allocation.md) are now implemented.
They do not establish batch identity or reconcile report rows to postings; D05 and the Amazon reconciliation criteria remain open.

## Shared inputs

| ID | Missing or incomplete input | Required detail and acquisition path | P0 dependency |
| --- | --- | --- | --- |
| D01 | Historical purchase costs | Product, batch, quantity, purchase date, unit price, currency, supplier and invoice reference. Reuse POs; supplement with invoices, spreadsheet imports and manual entries. | Historical COGS and profit |
| D02 | Opening inventory basis | Quantity and value by product/location at a chosen start date, known batches and confidence. Merchant import when history cannot be reconstructed. | FIFO and opening valuation |
| D03 | Item-level receipts and movements | Actual receipt quantities/dates, transfers, losses, write-offs and returns to stock, with source references. Expand receiving and ingest provider movements. | Batch depletion and inventory losses |
| D04 | Historical landed costs | Freight, duty, prep and other charges allocated to batches, including late bills, currency conversion and corrections. Extend existing PO records. | Batch/product margins |
| D05 | Historical product identity | Stable product/variant/SKU/ASIN/FNSKU links, marketplace, bundle composition and replacement/resale relationships. Preserve mappings over time and resolve unmatched records. | Joining all financial and stock events |
| D06 | Off-platform costs | Packaging, warehouse, fulfillment, return shipping and other bills with dates, currency and allocation basis. Imports/manual input first; integrations where justified. | Complete economics |
| D07 | Coverage and provenance | Dataset/account/period coverage, source IDs, effective and posting dates, revisions, permissions, currency, estimates and missing ranges. Extend sync tracking. | Every P0 report |

Today's catalog cost cannot establish historical purchase cost. Opening balances must not silently pretend to be
known purchase batches. FIFO allocations are accounting allocations, not proof of which physical unit Amazon shipped.

## Amazon acquisition

| ID | Input | Required detail | Source candidate and status | P0 dependency |
| --- | --- | --- | --- | --- |
| A01 | FBA returns | Order/product links, quantities, return dates, reasons, disposition and status | [US FBA importer implemented](../../amazon-returns.md); live account validation, resolved product/order matches and diagnostics remain | Returns diagnostics |
| A02 | Detailed inventory movements | Receipts, losses, damage, found inventory, adjustments and movement references | [US FBA importer implemented](../../amazon-inventory-movements.md); live validation, older history beyond the initial target, product/reference matching and reconciliation remain | Loss and batch reconciliation |
| A03 | Reimbursement detail | Reason, product, quantity, cash versus inventory recovery, original reimbursement references and reversals | [US FBA importer implemented](../../amazon-reimbursements.md); live validation, financial/reversal matching and diagnostics remain | Received recoveries and discovery |
| A04 | Storage and aged inventory | Product-level amounts, charge periods and identifying dimensions | [US FBA acquisition implemented](../../amazon-storage-fees.md); live validation, product matching and reconciliation of estimates/assessed charges to finances remain | Holding cost per product |
| A05 | Removals and disposal | Quantities, dates, status and related charges | [US FBA order/shipment acquisition implemented](../../amazon-removals.md); live range/format validation, product matching and reconciliation to movements/finances remain | Inventory exits and return cost |
| A06 | Inbound discrepancies | SKU-level sent and received quantities, shipment references and closure/status | Existing shipment data plus inbound receipt sources; verify actual received-quantity coverage by network | Inbound shortage investigation |
| A07 | FBM returns | Requests, reasons, refunds, receipt outcomes and merchant costs | Returns reports and merchant records; source coverage requires validation | Returns beyond FBA |
| A08 | Product advertising cost | Advertised-product identity, date, marketplace and spend; shared amounts kept separate | Expand Ads reports where attribution is supported; validate by ad product | Profit after advertising |
| A09 | AWD costs | Storage, processing and transport amounts linked to products or an explicit allocation basis | Audit stored finances and available AWD sources; item-level availability unresolved | Full AWD economics |
| A10 | Recovery investigation records | Evidence, case references, status, resolution, applicable eligibility dates and matching recoveries | Internal records/manual imports initially; validate external case access and current policies | Actionable discovery |

The [Amazon FBA report catalog](https://developer-docs.amazon/sp-api/docs/report-type-values-fba) documents returns,
reimbursements, detailed inventory, storage and removal reports. These complement financial transactions; their
amounts must not be added a second time. Check [returns report coverage](https://developer-docs.amazon/sp-api/docs/report-type-values-returns)
for FBM separately. AWD, claim access and reimbursement eligibility need dedicated validation; no automatic claim
submission is included here. An unexplained discrepancy is a candidate for investigation, not a confirmed debt.

## Shopify acquisition

| ID | Input | Required detail and acquisition path | P0 dependency |
| --- | --- | --- | --- |
| S01 | Refund events | Products, quantities, amounts, dates, shipping refunds, adjustments and payment references. Expand order ingestion. | Net sales and refund cost |
| S02 | Returns and exchanges | Reasons, item quantities, statuses, replacement items and inventory outcomes. Import return/reverse-fulfillment detail where available. | Returns diagnostics |
| S03 | Full payment economics | Amounts, processing dates, gateway, parent transaction, currencies and outcomes. Current transaction schema retains IDs/kinds/status/fees, not full payment history. | Partial/failed refund and payment reconciliation |
| S04 | Shipping revenue and financial adjustments | Shipping charged, discounts/refunds, tax/duty separation and order-edit effects. Expand order financial data. | Order profit and revenue reconciliation |
| S05 | Actual shipping expense | Outbound/return labels, carrier charges and order links. Reuse balance data where available; carrier/3PL imports or explicit estimates otherwise. | Fulfillment and return profit |
| S06 | External gateway fees | Actual processing/dispute fees and reversals outside Shopify Payments. Provider feeds or merchant imports. | Complete payment costs |
| S07 | Pick-and-pack and packaging | Actual charges or effective-dated per-order/per-item rules; distinguish estimates. Merchant/3PL input. | Product contribution |
| S08 | External advertising | Spend by channel/date and product where supported; unallocated spend explicit. Provider imports or manual expense input initially. | Profit after advertising |
| S09 | Historical changes and customer coverage | Capture older orders changed by refunds, cancellations or exchanges; backfill permitted history and customer IDs. Verify history/customer permissions and update ingestion. | Historical accuracy and customer metrics |

Use the project's Shopify API version, currently 2026-07. Sources:
[Refund](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Refund),
[Return](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Return), and
[OrderTransaction](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/OrderTransaction).
Refund existence alone does not prove successful payment. Shipping revenue is not the merchant's shipping expense.
Current quantities do not replace a dated refund/change history. Respect customer redaction and existing compliance
behavior when expanding history. Shopify connection alone does not imply access to external ad or payment accounts.

## Acquisition order

1. D07 and existing financial payload audit: verify access, coverage, classification and reconciliation targets.
2. A01-A05: Amazon return, recovery, movement and holding-cost detail.
3. D01-D05: cost history, opening inventory and receipts, alongside step 2; then A06.
4. S01-S04 and S09: Shopify financial events and historical completeness.
5. D06, A07-A09 and S05-S08: remaining merchant, fulfillment and attribution inputs.
6. A10: recovery investigation on top of reconciled source events.

## Analytics data readiness criteria

- [ ] Verify source, required permissions, account/marketplace eligibility and API version.
- [ ] Record available history, retention, backfill limits, refresh cadence and late-update strategy.
- [ ] Import available history without silent truncation; make missing ranges visible.
- [ ] Preserve source identifiers and raw evidence where appropriate; support repeat imports and corrections without duplication.
- [ ] Link products/orders/shipments/batches where justified; retain unmatched records and reasons.
- [ ] Reconcile amounts or quantities against provider totals; explain timing, currency and rounding differences.
- [ ] Distinguish actual, allocated, estimated, missing and not-applicable data.
- [ ] Record verification evidence and remaining limitations before marking ready.

Permission approval and historical availability remain account-level unknowns. A successful connection is not readiness.

## Live acceptance checkpoint: 2026-10-17

Fencing Club's connected workspace has 478 FBA return rows and 102 reimbursement rows across all 13 target windows.
Inventory movements have 10 of 13 windows imported (10,050 rows); older windows remain incomplete. Storage,
removal and FBM return feeds still have failed or unavailable periods, so those datasets are not ready.
Shopify financial history starts 2024-01-10 and was still backfilling at this checkpoint; ordinary orders and inventory
synced successfully. Amazon Ads report requests succeeded after the polling fix, but one downloaded report was rejected by scope validation; completed spend imports remain unverified. Historical purchase-cost, opening-balance and receipt collections are empty and require merchant evidence.
These observations are account-specific and do not establish reconciliation or complete P0 readiness.

### Provider investigation and reconciliation: 2026-10-17

- Confirmed the failed Ads download contains 90 daily campaign rows labeled `Sponsored Products`; request enums and
  report output labels differ. The importer now normalizes the three supported labels; live acceptance awaits release.
- Monthly storage reports exist for all twelve requested months. An actual report contains `8.0E-4`, which the strict
  decimal parser rejected. Exact scientific-notation expansion is implemented; imported coverage awaits release.
- Amazon returned genuine `FATAL` status for recent reimbursement and aged-storage requests, without diagnostic
  documents. Earlier aged-storage requests were `CANCELLED`. These remain failed/unavailable, never zero-cost evidence.
- FBM October, September and August 2026 imported; July hit throttling and older windows remain incomplete. The shared
  monthly report importer now attempts untouched history before failed windows and covered refreshes.
- Shopify's financial backfill is actively scanning June 2026, with completed coverage from 2024-01-10 through
  2026-05-30. At the read-only checkpoint, excluding marketplace-tagged copies and test orders left 353 orders,
  45 refund objects, six returns and 260 transaction fee entries. All included orders had return-scope coverage.
  There were 30 refund-payment references also present in order transactions: downstream totals must deduplicate
  by transaction ID, separate authorization from capture, and exclude failed/pending transactions from paid amounts.
- All 17,277 stored Amazon postings balanced against their top-level breakdowns. Item totals balanced for 16,893;
  384 lacked usable item totals. There were 6,650 release-linked postings and 193 order references absent from stored
  sales. These are coverage/accounting review items, not evidence of lost revenue.
- None of the 102 reimbursement rows' reimbursement IDs appeared in stored transaction/item related identifiers.
  Do not invent direct ID matching or mark recoveries reconciled based on amounts alone. Financial candidates remain
  unresolved; report amounts, inventory recoveries, release events and settlement cash must not be added twice.
- Reconciliation search now filters by evidence identifiers before its bounded result limit, so unrelated recent
  postings cannot crowd out historical order matches. Product-only matches remain candidates, not allocations.

The parser and search fixes require deployment and live verification. Shopify completion, provider-side report
failures, storage/Ads acceptance and source-to-posting allocations remain open. No reporting UX was added.

### Post-release acceptance: 2026-10-17 23:40 UTC

Release `05a88c4` is deployed and its production smoke checks passed. The first live retry recovered the recent
reimbursement reports: returns and reimbursements now have all 13 target windows imported (478 and 102 rows).
Monthly storage still has no imported rows: creation throttling prevented the repaired parser from receiving files.
The follow-up change reuses recently completed exact-scope reports for incomplete imports. Acceptance remains open
until those rows are persisted. Older movements, aged storage, removals and FBM periods are still incomplete.

Shopify financial history is complete through 2026-09-27, starting 2024-01-10, and the final window through the current
checkpoint is processing without errors. This is updated-order coverage, not proof every historical order date is covered.
Ads jobs remain active with repeated generic 503 retries; that code also represents transport exceptions. Safe stage
diagnostics distinguish token, report API and download failures. Only the previously completed zero-spend profile's
90 empty product-detail days were verified; the spending profile remains unaccepted.

October reconciliation returned candidates for all 28 returns and eight reimbursements; 27 returns and three
reimbursements had order-reference candidates. September's 11 reimbursement rows include five with order-reference
candidates. Product-only sales can crowd out reimbursement postings, so the follow-up ranks relevant posting types
before search/display bounds. Historical product mappings remain absent and all source links remain unconfirmed.
Do not turn these candidates into additional costs, recovery income or claim receivables.

At 23:45 UTC Shopify completed its final window through `2026-10-17T23:33:11.192Z` without errors. A consistent,
six-page evidence audit found 505 native orders, 58 refund objects, 11 returns, 835 payment transactions and 393 fee
entries. No test orders or Amazon/eBay-tagged copies leaked into this evidence set, and all included orders had imported returns
coverage. There were 38 refund-payment references also present in order transactions; those must be counted once by
transaction ID. These are evidence counts, not recognized revenue or profit, and ordinary sales-order history has
different coverage. Shopify historical economics acquisition is accepted through this cutoff; accounting remains open.

### Recovery acceptance: 2026-10-18 00:50 UTC

PR #44 is deployed in production release `67a6703`; full verification, review and release smoke checks passed.
The live retry persisted all 12 monthly storage reports, October 2025 through September 2026, with 8,446 rows
and no import errors. October 2025 inventory movements also recovered; November/December 2025 and the current
October 2026 movement refresh still report throttling. Other failed report families remain unaccepted.

September reconciliation now exposes reimbursement-type postings for nine of 11 records, up from six before ranking
changes. Five retain order-reference candidates. All remain unconfirmed, with no additional recognized amounts.

Both Ads profiles successfully requested reports, but downloads fail with `transport_TypeError`. The local Workers
runtime reproduces rejection of `redirect: "error"` before fetching. The fix uses manual redirects and explicitly
rejects redirect responses. Ads acquisition remains unaccepted until the repaired download persists real spend.

### Ads detail acceptance: 2026-10-18

The download runtime fix in PR #58 is deployed. Both profiles have 90 saved product-detail days (180 day records),
with 150 product-detail rows across the spending profile's 90 populated days. A consistent two-page evidence snapshot
confirmed these counts; the Ads connection reports no active job and no failure. Ads detail acquisition is accepted.
Aged storage still fails document validation for September 2026; older report generation failures and throttled
inventory/removal windows remain open. A fresh Amazon sync is running; do not treat these gaps as zero activity.

The latest saved checkpoint also has all 13 inventory-movement windows imported. Monthly storage retains all
8,446 rows, but a throttled September refresh currently leaves 11 windows marked complete. Older aged-storage
requests now report cancellation instead of generation failure; no zero-cost coverage is inferred from cancellation.
