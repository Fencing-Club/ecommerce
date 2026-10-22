# Copacker orders

`@repo/copacker-orders` is what a purchase order is: its schema (`orderInputSchema`, `OrderInput`), its lines
(`itemSchema`, `OrderItem`), where it goes (`destinationSchema`, `addressSchema`), what it costs and how its prices are
written (`money`). It depends only on `zod`, [`@repo/copacker-packing-rules`](../../copacker-packing-rules/docs/README.md) for each
line's receiver, and `@repo/copacker-marketplaces/shopify` for a Shopify variant's ID, cost and bundle components, so a
client or CLI can check a PO without the shipping documents.
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

An address has one format everywhere: `addressLines(address)` gives its lines as a document prints them ("1000 Siji
Road", "Building 3", "Yiwu, Zhejiang 322000", "CN"), and `addressLine(address)` joins them on one line for lists and
summaries. Both leave out what isn't known.

`orderLine(variant, id, defaults, currency, destination)` is a new PO line for a Shopify variant: its Shopify unit cost
per piece, and the product's saved defaults (`LineDefaults`) for its instructions, prep category, suffocation warning,
SKU label and Amazon network, which `receiverFor` in `@repo/copacker-packing-rules` turns into the line's receiver.
Lines added in the PO editor, imported from a supplier's document and added by a supplier's changes all start there,
so a product kept at AWD lands at AWD whichever way it joins a PO. An import or a supplier's change then sets the
line's quantity and price.

A line's product goes by `lineName(name, variant)`, such as "Canvas tote bag / Natural", which leaves out Shopify's
"Default Title" for a product's only variant. `shipmentGroups(lines)` splits a PO's lines into the shipments they
become, one per receiver, Amazon's networks in `amazonNetworks`' order and then the buyer's location; the PO editor and
the PO's page both show them that way.

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
`orderSubtotal` is the products at their unit prices alone and `orderUnits` their pieces, as the cost summary's first
row shows them.
Product unit prices remain separate from service rates. Removing or moving a product removes or moves its costs;
changing its quantity recalculates per-piece and per-pack charges. Flat charges remain fixed.

See [Copacker's product rules](../../../apps/copacker/docs/domain.md) for the purchasing workflow.
