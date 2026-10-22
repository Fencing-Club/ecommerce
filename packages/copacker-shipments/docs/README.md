# Copacker shipments

Purchase orders, packing, labels, shipping documents, supplier requirements and transport for Copacker:
`@repo/copacker-shipments` and its subpaths. Marketplace clients and report parsers live in
[`@repo/copacker-marketplaces`](../../copacker-marketplaces/docs/README.md).

## Packing rules

The carton and pallet rules, and `validatePacking`, live in
[`@repo/copacker-packing-rules`](../../copacker-packing-rules/docs/README.md). This package uses it to check a packing before
building Amazon's inbound plans (`buildFbaPlan`, `buildAwdRequest`), and re-exports its receivers. Each PO line names
its `receiver`; `orderDestination` reads where the PO goes from them.

## Shared values

The app reads these from the package rather than restating them: the currencies a PO or a supplier price can be in
(`orderCurrencies`), each Amazon network's name (`amazonNetworkNames`), the schemas' field limits (`itemSchema.shape`,
`cartonInputSchema.shape`, `palletInputSchema.shape`, `packingSchema.shape`) and an address as documents print it
(`addressLines` in `/documents`).

## Supplier service costs

`OrderItem.supplierCharges` stores supplier services assigned to that product. Each charge has a description,
an integer rate in the order currency's minor units, and a basis: `piece`, `pack`, or `flat`.
Pack quantities come from Shopify bundle components (`pieces / piecesPerSet`).

`supplierChargeTotal` calculates one service, `itemTotal` includes a product's services, and `orderTotal` adds
all product totals and PO-level adjustments. `orderCharges` supplies consistent summary rows for the app and PDFs.
Product unit prices remain separate from service rates. Removing or moving a product removes or moves its costs;
changing its quantity recalculates per-piece and per-pack charges. Flat charges remain fixed.

See [Copacker's product rules](../../../apps/copacker/docs/domain.md) for the purchasing workflow.
