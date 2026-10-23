# Expanded analytics ingestion

Deployed to production, including migration 0057, in [release 02eeb1c](https://github.com/AndrewCraswell/ecommerce/actions/runs/39068570712) on 2026-10-17. The Shopify scope configuration has also been released; existing accounts still require their own grants. Live source coverage and account acceptance remain incomplete; see the [account checkpoint](specs/analytics/analytics-data-backlog.md#live-acceptance-checkpoint-2026-10-17). This delivery is ingestion-only; upload screens and other UX work are out of scope. These imports preserve evidence; they do not replace Overview or automatically recognize profit or claim receivables.

## History target

Target the earliest available history for each account and dataset. Provider access and retention can differ, so a single global start date must not imply complete coverage. The current collector windows below are implementation limits, not a claim that older provider history is unavailable. Extending those windows requires verifying provider support and backfill behavior.

Keep the earliest source record separate from the earliest period with reliable profitability. Historical costs can predate provider windows. Opening inventory needs a supported dated count and valuation; missing purchase costs remain unknown, never zero or silently replaced with today's cost.

## Historical costs and merchant bills

`POST /api/analytics/cost-imports` accepts `{ "rows": [{ "id": "UUID", "kind": "inventory|landed|expense", "data": {} }] }` with the existing Origin, permissions and UUID Idempotency-Key contract. A batch contains 1–100 rows, processed in order in one transaction. Preassign purchase UUIDs to reference them from later receipt and landed-cost rows. Any invalid row rolls back the whole batch. Reusing the batch key with the same actor and normalized body returns the original import; a changed body conflicts. `GET /api/analytics/cost-imports/{id}` returns the audited result.

`POST /api/analytics/cost-import-previews` accepts the same rows without an idempotency key. It returns 200 `{preview: {rows, count}}` with normalized inputs after exercising the same transactional validation as an import, including references between rows. The transaction is always rolled back, including temporary correction retirements. It creates no saved preview resource, reserves no IDs and sends no external requests. It uses write permissions and Origin checks because it validates protected cost edits. Validation failures use the standard problem response. A preview is not a reservation: submit its rows to cost-imports with a new import key; commit revalidates against current data and can still conflict.

Inventory and landed rows use the existing [cost inputs](historical-inventory-basis.md) and [landed charges](inventory-costing.md) contracts. Invoice and batch references, dated opening valuations and actual receipt evidence remain merchant inputs. APIs accept structured JSON; spreadsheet upload and entry screens are not included.

Expense rows require sourceReference, sourceLine, occurredAt, category, signed decimal amount, currency, actual/estimated costBasis, evidence and attribution. Attribution is an order UUID, a workspace product identity, or shared with a reason. Categories cover outbound/return shipping, pick-and-pack, packaging, warehouse, gateway/dispute fees, advertising, AWD storage/processing/transport and other bills. Credits are negative. Corrections name supersedes and retain retired history. GET /api/analytics/operating-costs lists active costs. Import only bills not already counted from financial feeds; automatic cross-provider invoice matching is not implemented.

## Execution and runtime

The API handlers use TanStack Start's server route registration and current workspace sessions. They retain the analytics JSON error, authorization and private-cache contract. Long collections run in Cloudflare Workflows, outside web requests. Shopify financial jobs publish the Cloudflare wake signal after the durable job insert and checkpoint each successful page before yielding. Failed pages retain their cursor and retry with a delay; a superseded sales revision or disconnected account cannot publish evidence.

## Provider evidence

`GET /api/analytics/evidence?source=shopify&externalAccountId=...&dataset=order_economics` lists evidence in 100-record snapshot pages. `GET /api/analytics/ingestion-status` exposes observed feed state and connected accounts; absent feeds mean not imported. Permissions and workspace isolation match the analytics contract. Marketplace-tagged Shopify copies and test orders are excluded from evidence lists.

- Shopify order_economics: payment amounts, gateway, parent transactions, statuses and fees; order shipping/tax/duty/discount totals; dated refund lines, shipping refunds, adjustments and linked payments. Returns include reasons, exchange items and reverse-fulfillment dispositions when read_returns is granted. Missing permission is explicit, never an empty return history. The connect flow now requests read_returns; existing stores must grant it after configuration release.
- Shopify scans updated_at, including older changed orders, with a fixed window and persistent page cursor. An independent durable job imports 50 orders per page and automatically resumes. With read_all_orders it discovers the earliest accessible updated order and scans forward in windows of at most 31 days; without that permission the initial window is 60 days. Ordinary sales-order ingestion still has its existing history limit. Later completed windows overlap one day. Nested connections are paginated; bounded transaction/refund lists reject possible truncation. An order changed during collection is retried. Independent source snapshots do not silently modify prior FIFO evidence.
- Amazon fba_inbound_receipts and awd_inbound_receipts: discover shipments independently of freight charges and refresh the 40 least recently observed per network. Preserve sent/expected versus received amounts and AWD units. Missing received amounts remain unknown. Differences are investigation candidates; snapshots are not dated warehouse receipts or proof of eligible claims. Missing historical shipments and provider retention still need live validation.
- Amazon fbm_returns: backfills missing calendar months across the current month and twelve completed months. Recent months refresh daily and older completed months every 30 days. Each successful month replaces its evidence document; failed windows preserve prior evidence and record a failure. Captures item, reason, status, resolution, refund/label amounts and SAFE-T references where supplied. Date-only source records retain day precision. Returnless refunds are outside this report.
- Amazon awd_costs: reuses existing financial postings whose description starts with AWD. Amounts remain signed financial evidence and unallocated until attribution is justified; they are not additional charges. A 10,000-row bound is explicit.
- Amazon advertising_products: a second durable report stage captures Sponsored Products/Display SKU spend after the existing all-product daily total. Detail never overwrites the total. Sponsored Brands and missing SKU spend remain unallocated; failures remain visible in Ads job status. Live field compatibility and total reconciliation must be accepted before product-profit reporting.

Source references: [Shopify Refund](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Refund), [Return](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Return), [Amazon returns report](https://developer-docs.amazon/sp-api/docs/report-type-values-returns), [AWD API model](https://github.com/amzn/selling-partner-api-models/blob/main/models/amazon-warehousing-and-distribution-model/awd_2024-05-09.json), [Amazon advertising dimensions](https://advertising.amazon.com/API/docs/en-us/guides/amazon-marketing-stream/v2/datasets/ads-performance).

## Amazon report retry diagnostics

FBM cancellation records `report_cancelled`, without claiming an empty month. FBM requests stop for the current run
on access denial or throttling, leaving unattempted older months missing; independent AWD finance evidence still runs.
FBM and shared monthly FBA importers distinguish document parsing (`report_invalid_document`) from date-window
validation (`report_outside_period`) and provider requests (`report_failed`). No source rows or validation messages
are exposed in these failure codes. Failed refreshes preserve previously imported evidence and coverage bounds.


Production report creation uses [shared pacing and persistent cooldowns](amazon-report-limits.md), including across
restarts and report types. Report reads wait one minute, then two after throttling, respecting longer Retry-After values
within the request deadline. Poll/document retries keep the existing report ID.
Every managed creation makes one attempt; the durable cooldown governs later jobs. FBM recovery can reuse an exact
completed report created within the last day.

AWD/FBA receipt collection checkpoints each successful shipment. A malformed individual shipment does not discard other
snapshots or prevent later shipments from being attempted; access and rate failures stop that network. Partial failure
remains visible. Diagnostics identify the report operation, Amazon FATAL processing outcome and allowlisted schema fields,
without logging source rows or provider messages. Live reimbursement refreshes and AWD receipt collection subsequently succeeded; see the
[dated checkpoint](specs/analytics/analytics-data-backlog.md#retry-recovery-acceptance-2026-10-18-2115-utc). Older FBM
validation remains open. These results do not establish complete historical coverage.


AWD shipment lists and receipt reads retry transient HTTP failures within a five-minute deadline, respecting Retry-After
and rechecking job ownership before another request. List retries retain the same page token; receipt retries retain
the shipment ID. Schema errors and access denial are not retried. See [removal collection](amazon-removals.md) for the
combined date-range requests that reduce the removal backfill from up to 26 reports to two.


FBM return parsing supports English named-month dates, year-first dates and timestamps with explicit UTC offsets.
Date-only records retain day precision; numeric day/month order and timestamps without zones are not guessed.
Explicit unavailable monetary placeholders stay null, while decimal amounts remain exact signed strings. Invalid
dates and malformed amounts still reject the complete file. Diagnostics retain a masked date format (letters and
digits replaced), never the source date, order, customer text or monetary values. Live revalidation is required.

## Cost-basis input inventory

`GET /api/analytics/ingestion-status` includes workspace-scoped active accounting-input counts by record kind and
actual/estimated/missing cost basis, plus dated product and unit mapping counts. Missing categories mean not recorded.
These counts do not assess historical period coverage or establish complete profit; retired records are excluded.
No provider fetch, backfill or accounting write is triggered by this read.

Receipt evidence responses include `receiptQuantities`: expected/sent and received amounts in their original units,
shortfalls/overages only for comparable units, and explicit missing/duplicate-SKU/unit-mismatch states. Current exact-SKU
Shopify candidates help identify products but never establish historical identity. Case counts remain cases; physical
piece quantity, receipt date and cost basis remain unknown. These snapshots do not confirm acquisition or claim eligibility.

Receipt `reviewState` distinguishes inactive (cancelled/deleted), not-final, closed-quantity-review and unknown-status
shipments. Raw differences remain visible for audit but only closed shipments become quantity-review candidates;
closed status still does not prove loss, completed receiving, or reimbursement eligibility.

`receiptOutcome` separates inactive plans, receiving not final, closed with no receipts reported, closed with matching
counts, closed with differing counts and unknown quantities. Closed comparisons require unique SKUs, nonmissing counts
and compatible supported units. A closed zero-receipt plan is not automatically an unused plan: `unusedPlanConfirmed`
remains null without recorded merchant evidence. `transferToFbaConfirmed` remains false. `unitConversion` explains that
dated product and pack evidence is still required; no current catalog pack size is applied to historical case receipts.

## Stored-evidence acceptance and remaining work

PR #71 deployed as `dae10ab0` on October 19, 2026. Its read-only production checks verified reimbursement diagnostics,
Shopify payment differences and FBA receipt comparisons without starting a sync or backfill. AWD receipt data was
observed, but its comparison remains pending explicit network and unit mapping. The dated results and
remaining coverage, payment-classification and transfer-accounting work are tracked in the
[analytics data backlog](specs/analytics/analytics-data-backlog.md#next-stored-evidence-work-no-backfill-or-ux).
Receipt movement sums are partial-history observations until coverage of the receipt period is established. They do not
prove loss, acquisition or cost basis. All cost basis remains unknown unless separately supported by recorded evidence.
