# Historical landed costs and FIFO

Implemented locally; migration 0052 is generated but not deployed. These resources calculate costs from recorded evidence. They do not replace Overview. Opt-in sales ingestion is described in [automatic depletion imports](automatic-depletion-imports.md).

## Resources

All follow the [analytics HTTP contract](analytics-api.md), including workspace permissions, private responses, Problem Details, repeat-safe creation and audited retirement.

- `/api/analytics/landed-charges`: GET history and POST a bill or credit; `/{id}` supports GET and DELETE retirement.
- `/api/analytics/depletions`: GET history and POST consumed pieces; `/{id}` supports GET and DELETE retirement.
- `/api/analytics/fifo`: GET calculation for `shopifyDomain`, `variantId`, `location`, `from` and exclusive `to` dates (UTC, maximum 31 days).

Collections return 100 records per page with a snapshot continuation token. FIFO totals cover the entire requested period, even when depletion rows are paginated. Changed evidence invalidates continuation. Calculations reject more than 10,000 active product records or applicable charges rather than return partial accounting. Lot detail is limited to 100 entries with `lotsTruncated`.

## Landed bills

POST fields: `sourceReference`, `sourceLine`, `occurredAt`, `evidence`, optional `supersedes`, `category` (`freight`, `duty`, `prep`, `other`), `costBasis` (`actual`, `estimated`), signed decimal-string `amount`, `currency`, `basis` and `targets`.

Each target names an active `purchaseId`. Allocate by `pieces`, `purchase_value`, or `manual` (each target supplies `amount`). All targets must share the bill currency. Manual shares must sum exactly and have the bill's sign. Weighted allocation uses largest remainders at six decimal places, with purchase ID breaking ties. Credits cannot make a purchase's total landed value negative; corrections and retirement enforce the same rule.

Optional `poLandedCostId` reuses an existing buyer-owned PO charge. Amount, category, currency and target purchase-order links must match. The imported bill is a frozen snapshot; later PO edits do not silently rewrite history. The same source bill cannot be imported twice with different request keys. Purchases with active charges cannot be retired or replaced until those charges are retired.

## Depletion and cutover

POST depletion fields: `kind: depletion`, source reference/line, timestamp, evidence, product identifiers, `quantity`, `piecesPerUnit`, `location` and optional `supersedes`. Quantities are physical pieces. References identify the source sale/event; these entries do not assert provider coverage or validate sellable-unit conversion.

An explicit opening balance establishes the product/location cutover, including an explicit zero balance when appropriate. Receipts at or before cutover are assumed included in that balance. Only subsequent sellable receipts add available lots; damaged/uninspected stock is excluded. Earlier depletions are excluded. Depletions from cutover to the report start still consume inventory before period results are calculated.

FIFO follows receipt availability. At equal timestamps receipts precede depletions; UUID breaks other ties. Purchase cost plus active landed bills is spread over purchased pieces, then allocated cumulatively to receipts across all locations and conditions. Thus unreceived stock retains its share, and each fully consumed lot's cost is conserved exactly at six decimals.

## Interpretation

Late bills and corrected evidence restate historical calculations using current active evidence, regardless of bill date. This is not a historical knowledge-date snapshot. No implicit FX is performed: currencies remain separate.

Rows distinguish `valued`, `estimated`, `missing_cost`, `mixed_currency`, `insufficient_inventory` and `blocked_after_shortage`. Unknown cost is null, not zero. A shortage leaves COGS unresolved and blocks later depletion until evidence is corrected; future receipts cannot cover earlier sales. Ending quantity/value are null after a shortage, and displayed lot balances are provisional. Known cost components remain available by currency.

`recordedCostCoverageComplete` describes the recorded depletion inputs only. It does not prove that all sales or costs were imported. Estimated values remain labeled, and missing landed bills are not evidence of zero landed expense.

## Remaining work

Automatic Amazon/Shopify sale-to-depletion conversion, provider receipt/location reconciliation, return-to-stock costs, losses/transfers, opening-lot reconstruction, FX policy, entry/import screens and live-account acceptance remain open. These must precede replacing customer-facing profitability calculations.

See [sales-linked FIFO imports](sales-cost-imports.md) for importing stored Shopify and Amazon fulfillment evidence.

[Dated conversions and automatic depletion imports](automatic-depletion-imports.md) now provide opt-in processing after sales sync; live coverage and return-to-stock accounting remain pending.
