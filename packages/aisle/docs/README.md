# Aisle domain library

Shared purchase order, packing, commerce integration and document contracts used by Copacker.

`@repo/aisle/returns` parses Amazon's FBA customer returns report with strict headers, quantities and timezone-bearing
timestamps, including quoted multiline TSV fields. It preserves source rows and unknown codes, omits customer comments,
and rejects malformed documents rather than silently dropping records. [Copacker's importer](../../../apps/copacker/docs/amazon-returns.md)
owns persistence, scope, monthly replacement and coverage.

`@repo/aisle/reimbursements` parses FBA reimbursement details using the same TSV reader. It retains exact signed decimal
amounts, separate cash/inventory quantities, missing values and original reimbursement references. It does not infer
financial postings or loss eligibility. See [reimbursement ingestion](../../../apps/copacker/docs/amazon-reimbursements.md).

`@repo/aisle/ledger-detail` parses all detailed-ledger events/dispositions, retaining signed quantities, source references,
reported calendar dates and raw source clock text. Missing optional values and unknown codes remain explicit. See
[movement ingestion](../../../apps/copacker/docs/amazon-inventory-movements.md); the existing summary-ledger parser
continues to supply stockout-day balances separately.

`@repo/aisle/storage-fees` parses monthly storage estimates and aged-inventory charges separately, retaining exact
decimals, calendar dates and raw fee components without summing or inventing missing product mappings. See
[storage ingestion](../../../apps/copacker/docs/amazon-storage-fees.md).

`@repo/aisle/removals` parses removal orders and shipments with distinct quantities, exact fees and timezone-bearing
dates. It retains source codes and split shipments without assuming financial or inventory postings. See
[removal evidence](../../../apps/copacker/docs/amazon-removals.md).

## Supplier service costs

`OrderItem.supplierCharges` stores supplier services assigned to that product. Each charge has a description,
an integer rate in the order currency's minor units, and a basis: `piece`, `pack`, or `flat`.
Pack quantities come from Shopify bundle components (`pieces / piecesPerSet`).

`supplierChargeTotal` calculates one service, `itemTotal` includes a product's services, and `orderTotal` adds
all product totals and PO-level adjustments. `orderCharges` supplies consistent summary rows for the app and PDFs.
Product unit prices remain separate from service rates. Removing or moving a product removes or moves its costs;
changing its quantity recalculates per-piece and per-pack charges. Flat charges remain fixed.

See [Copacker's product rules](../../../apps/copacker/docs/domain.md) for the purchasing workflow.

`@repo/aisle/fulfillment-shipments` parses dated FBA shipment items with stable identities and an accounting-only field allowlist. Sales readers also retain Shopify fulfillment creation and in-transit times. See [shipment-date evidence](../../../apps/copacker/docs/shipment-date-evidence.md).

The shopify-economics collector reads bounded financial/return evidence independently of sales history; fbm-returns parses seller-fulfilled return reports without customer text.
