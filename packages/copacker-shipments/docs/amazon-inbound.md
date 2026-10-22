# Amazon inbound shipments

`@repo/copacker-shipments/amazon-inbound` holds what Copacker decides about an Amazon inbound shipment without a
database or a web framework:

- the names it gives AWD orders and FBA plans (`amazonReference`, `fbaPlanName`) and each network's Seller Central page
  (`sellerCentralShipment`);
- the FBA plan's choices: packing, placement, the buyer's own carrier, delivery window, pallets and box matching;
- spreading inbound freight over the SKUs each shipment carried (`freightShipment`, `freightPerSku`).

A choice that stops the plan throws `FbaInboundError` with a `code` and `values`; the app turns it into its translated
error. The app's FBA job (`apps/copacker/src/server/fba-shipments.ts`) calls Amazon and stores the results.
