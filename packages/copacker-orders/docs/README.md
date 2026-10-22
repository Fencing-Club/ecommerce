# Copacker orders

`@repo/copacker-orders` is what a purchase order is: its schema (`orderInputSchema`, `OrderInput`), its lines
(`itemSchema`, `OrderItem`), where it goes (`destinationSchema`, `addressSchema`), what it costs and how its prices are
written (`money`). It depends only on `zod`, [`@repo/copacker-packing-rules`](../../copacker-packing-rules/docs/README.md) for each
line's receiver, and `@repo/copacker-marketplaces/shopify` for a Shopify variant's ID, so a client or CLI can check a PO
without the shipping documents.
[`@repo/copacker-shipments`](../../copacker-shipments/docs/README.md) packs, labels and ships it.

- The package root: the PO and line schemas, payment terms (`commonPaymentTerms`), the kinds of cost a PO's summary can
  add or take off (`adjustmentTypes`), Amazon's prep categories a line can have (`prepCategories`), the supplier's
  SKU and price changes (see [Supplier changes](#supplier-changes)) and the totals (see
  [Supplier service costs](#supplier-service-costs)).
- `packing-requirements`: what the supplier must do to each product (`packingRequirementsSchema`), as the tasks the
  shipping documents list (`packingTasks`).

Each PO line names its `receiver`; `orderDestination` in `@repo/copacker-packing-rules` reads where the PO goes from
them, and `orderInputSchema` keeps a PO's lines to one group of receivers.

## Shared values

The app reads these from the package rather than restating them: the currencies a PO or a supplier price can be in
(`orderCurrencies`) and a PO line's field limits (`itemSchema.shape`).

## Supplier changes

A supplier sends its SKU and unit price for each line with a packing (`itemChangeSchema`, in `Packing.changes`).
`commercialChanges` lists the ones that differ from the PO, which wait for the buyer's approval, and `approveChanges`
makes them the PO's next revision. A new supplier SKU drops the line's catalog quote, since the quote was for the old
one.

## Supplier service costs

`OrderItem.supplierCharges` stores supplier services assigned to that product. Each charge has a description,
an integer rate in the order currency's minor units, and a basis: `piece`, `pack`, or `flat`.
Pack quantities come from Shopify bundle components (`pieces / piecesPerSet`).

`supplierChargeTotal` calculates one service, `itemTotal` includes a product's services, and `orderTotal` adds
all product totals and PO-level adjustments. `orderCharges` supplies consistent summary rows for the app and PDFs.
Product unit prices remain separate from service rates. Removing or moving a product removes or moves its costs;
changing its quantity recalculates per-piece and per-pack charges. Flat charges remain fixed.

See [Copacker's product rules](../../../apps/copacker/docs/domain.md) for the purchasing workflow.
