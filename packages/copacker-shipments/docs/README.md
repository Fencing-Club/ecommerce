# Copacker shipments

Packing, labels, shipping documents, supplier requirements and transport for Copacker: `@repo/copacker-shipments` and
its subpaths. Purchase orders, their lines and their costs live in
[`@repo/copacker-orders`](../../copacker-orders/docs/README.md). Marketplace clients and report parsers live in
[`@repo/copacker-marketplaces`](../../copacker-marketplaces/docs/README.md).

## Packing rules

The carton and pallet rules, and `validatePacking`, live in
[`@repo/copacker-packing-rules`](../../copacker-packing-rules/docs/README.md). This package uses it to check a packing before
building Amazon's inbound plans (`buildFbaPlan`, `buildAwdRequest`). Each PO line names its `receiver`; import the
receivers and `orderDestination`, which reads where the PO goes from them, from that package.

## Shipment states

`states` lists every state a shipment can be in (`shipmentStates`, `ShipmentState`) and the groups the app and
transport check: `openPackingStates`, `amazonRequestStates`, `releasedStates`, `shippedStates`, `packedStates` and
`finishedStates`. `canEditPacking` and `canReopenPacking` say when packing can still change. The app's database column
and pages read these rather than listing states themselves. `canConfigureTransport` in `transport` uses them too.

## Amazon inbound shipments

Naming FBA and AWD shipments, the FBA plan's choices and inbound freight: see [Amazon inbound shipments](amazon-inbound.md).

## Carrier labels

A buyer's own parcel carrier labels go on cartons by what they print. `tracking-numbers` reads a label's tracking number
from its text or barcodes and names its carrier (`trackingCarrier`). `label-measurements` reads the weight and size it
prints and checks they fit a carton configuration (`fitsConfiguration`).

Amazon's carton labels can come as a ZIP. `shipment-artifacts` checks it before anything reads it
(`inspectShipmentZip`): safe paths, size and entry limits, checksums and a timeout, returning each file's bytes. Its
tests build each ZIP byte by byte in the test, and treat a PDF inside it as bytes.

## Shipping documents

`shipping-snapshot`, `shipping-model`, `shipping-rules` and `shipping-copy` hold the packing list and packing
checklist's data model and rules, with no React: `shippingDocumentSnapshot` and `packingListSnapshot` build the
document data from a PO, its packing, labels and transport. Copacker's app renders that data with react-pdf; see
[shipping document templates](../../../apps/copacker/docs/shipping-document-templates.md). Their tests build the
document data from small fixtures of their own (`tests/shipping-fixtures.ts`), never the app's. `countries` lists the
ISO countries addresses use.

`documents` draws the purchase order and commercial invoice with pdf-lib, and `combinePdfs` joins PDFs. Packing lists and
checklists come only from the shipping-document data above. `orderLineText` is the text a PO or invoice line prints;
tests check it rather than drawing a document, and the app's tests stub `purchaseOrderPdf` and `commercialInvoicePdf`.

## Shared values

The app reads these from the package rather than restating them: each Amazon network's name (`amazonNetworkNames`),
and the schemas' field limits (`cartonInputSchema.shape`, `palletInputSchema.shape`, `packingSchema.shape`). The PO's
own values, and the address format documents print (`addressLines`), are in
[`@repo/copacker-orders`](../../copacker-orders/docs/README.md#shared-values).

See [Copacker's product rules](../../../apps/copacker/docs/domain.md) for the purchasing workflow.
