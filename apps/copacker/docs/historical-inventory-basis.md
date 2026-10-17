# Historical inventory cost inputs

Implemented locally: dated purchase costs, opening inventory balances, and actual item receipt entries. This is the
input foundation for D01, D02 and D03. [Historical costing](inventory-costing.md) adds landed-cost allocation and FIFO over explicit depletion records.
Automatic sale conversion, transfers, write-offs and return-to-stock accounting remain open. Existing Overview calculations and stock snapshots are unchanged.
Migration 0051 must be deployed before use; no production migration or account operation has been performed.

## Resources and access

| Collection | Body kind | Meaning |
| --- | --- | --- |
| `/api/analytics/purchase-costs` | `purchase` | Dated base purchase cost and purchased piece quantity |
| `/api/analytics/opening-balances` | `opening` | Opening piece quantity and known/estimated/unknown value at a location |
| `/api/analytics/receipts` | `receipt` | Merchant-confirmed actual piece quantity received against a purchase |

Each collection supports GET and POST; `/{id}` supports GET and DELETE (retirement, not erasure). They follow the
[analytics HTTP contract](analytics-api.md): session/workspace isolation, Sales and Prices for reads, Products edit and
Prices plus app Origin for writes, JSON Problem Details, private/no-store, UUID Idempotency-Key on POST, 201 plus Location
on creation, 200 for an identical retry, and 204 for repeated retirement. No provider connection is required.
Bodies include the collection's `kind`; a mismatched kind is rejected. GET lists include retired history, at most 100
records, `hasMore`, zero-based `page` and `snapshot`. Continue with the snapshot or restart on 409. Optional
`shopifyDomain` and `variantId` filters are bound into that token. Unknown or foreign record IDs return 404.

Common input fields are `sourceReference`, `sourceLine`, `occurredAt` (timezone-bearing timestamp), `evidence`, and
optional `supersedes`. Future events are rejected. Source references identify a document and its item/event line, not a
product alone. Repeated imports with fresh request keys still cannot duplicate an active source line. Idempotency keys
are reserved for the life of the record; identical retries return the existing audit representation, even after retirement.

## Purchase cost sources

For `source.type: manual`, supply `shopifyDomain`, `variantId`, `quantity`, `piecesPerUnit`, `unitCost: {amount, currency}`,
`supplierReference`, `invoiceReference`, `batchReference`, and optional `costBasis` (`actual`, default, or `estimated`).
Actual is the merchant's assertion backed by evidence; the app has not verified the invoice externally. The product must
exist in local workspace variant fields or Shopify stock evidence. Invoice supplier/reference/line identifies duplicates.

For `source.type: purchase_order`, supply `orderId`, `revision`, `itemId`, `invoiceReference` and `batchReference`.
The server scopes the PO to this buyer and rejects a currently draft PO. It reads the selected saved revision (or the
current revision) and snapshots product, currency, ordered pieces, pieces per set, and base piece price. PO prices are
labeled estimated because an order revision alone does not prove an actual invoiced cost. Ordered quantities do not
create receipts. The same PO item cannot be imported twice by selecting another revision; correct the existing record.
Source line charges and PO adjustments are retained as evidence but excluded from base purchase cost. Later PO changes
never rewrite this stored snapshot. Existing historic PO products remain usable even if absent from the current catalog.

All quantities are whole physical **pieces**, not cartons or sellable packs. `piecesPerUnit` preserves the conversion
for a homogeneous sellable pack; it does not model a bundle of different components. Unit costs are per physical piece.
Money uses nonnegative decimal strings with at most six decimal places and three-letter currency codes. Totals use
integer decimal arithmetic; no float rounding, implicit FX or cross-currency aggregation is performed.

## Opening balances

Supply product identifiers, `quantity`, `piecesPerUnit`, `location`, `batchReference` (string or null), and `valuation`:

- `{status: "unknown"}` stores a null cost, never a fabricated zero.
- `{status: "actual", totalCost: {amount, currency}}` records a known opening value.
- `{status: "estimated", totalCost: {amount, currency}}` preserves an explicitly estimated value.

Zero quantity cannot carry positive value. Only one active opening baseline per product/location is allowed; a later
correction must supersede it rather than add another baseline. A null batch reference represents aggregate inventory
whose purchase lots are unknown. The record does not invent a purchase date or supplier. Splitting an opening balance
into multiple historical lots and choosing an accounting cutover remain subsequent work.

`location` is a stable, merchant-supplied reference such as `warehouse:A` or `amazon:SELLER:US:FBA`; it is not a validated
provider location mapping. Reuse exactly the same reference for that location. Location reconciliation remains open.

## Receipts and corrections

Supply `purchaseId`, actual `quantity`, `location`, `condition` (`sellable`, `damaged`, `uninspected`), and optional
`shipmentId`. Product identity, conversion and cost come from the referenced active purchase. Receipt date cannot precede
purchase date. Partial and split-location receipts are supported, but their combined active quantity cannot exceed the
purchase quantity. Damaged and uninspected pieces count as received, not confirmed sellable stock. A shipment link must
belong to the same buyer and the purchase's PO; it does not itself validate the merchant's receipt count.

Writes serialize within the workspace. Corrections atomically retire the named active record and insert a replacement.
A concurrent correction of the same revision fails with 409. Duplicate source lines, multiple opening baselines and
excess receipt quantities also return 409. Purchases with active dependent receipts or landed charges cannot be replaced or retired:
retire those dependencies first, correct the purchase, then re-enter them against its replacement. Their old history
remains available. Replaying an old request never reactivates retired evidence.

## Remaining accounting work

Do not add purchases, opening balances and receipts together as inventory acquisitions: receipts refer to purchases,
and opening balances may already include pre-cutover receipts. The [costing engine](inventory-costing.md) uses an explicit opening cutover and supports late landed bills.
Provider coverage and locations, physical piece/sellable-unit conversions, receipt imports, missing purchases, actual
shipment item reconciliation, returns, losses and UI entry/import flows remain open. Received base cost is not complete landed value.
