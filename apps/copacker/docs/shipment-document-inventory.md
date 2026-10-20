# Shipment document inventory

Review reference for the files associated with a shipment. This is separate from the download sidebar: show a document there only after its current file exists and the viewer has access. Hide missing, obsolete and unreleased files; show preparation blockers in the workflow instead.

## Shipment files

| File | Applies to | Available when | Source |
| --- | --- | --- | --- |
| Packing list | Every shipment | Packing is submitted, the destination is known and the PDF is generated | Shipment packing snapshot |
| Packing checklist | Every shipment with packing or handling tasks | Tasks and the shipping arrangement are confirmed and the PDF is generated | PO product requirements and shipment transport |
| Carton label reference | Shipments with carton label assignments | Required label files are matched to physical cartons and the reference PDF is generated | Verified carton-to-label mapping |
| Carton labels | FBA and AWD | Amazon supplies the original label files for the confirmed shipment | Amazon |
| Pallet labels | FBA shipments on pallets | Amazon supplies four labels for each pallet once it labels the cartons | Amazon |
| Carrier labels | Services requiring carrier labels | The selected carrier supplies the files after booking, or the buyer uploads them | Amazon or the booked carrier |

The carton label reference explains which label belongs to each carton; it is not printable barcode artwork. Carton labels, carrier labels and pallet labels are separate files. AGL or forwarder pickup must not imply a separate carrier-label requirement.

## Related PO and product files

These remain owned by the PO or product, but should be accessible for the shipment's included items.

| File | Available when | Download location |
| --- | --- | --- |
| Purchase order | The submitted PO PDF exists | PO and related shipment documents |
| Supplier invoice | The supplier uploads the invoice; use the approved revision for dispatch | PO and related shipment documents |
| SKU labels | The product's label file is generated or uploaded | Product labels menu and product row |
| FNSKU labels | The product has the correct FNSKU and its label file exists | Product labels menu and product row |
| Suffocation warning labels | Required by the product's packing instructions and the file exists | Product labels menu and product row |
| Choking hazard labels | Required by the product's packing instructions and the file exists | Product labels menu and product row |
| Other supplied product labels | An applicable product label has been uploaded | Product labels menu and product row |

Country-of-origin labels are excluded from this scope.

## Bundles and review questions

The supplier pack is a convenience download of available, released documents, not an additional shipment attachment. Preserve the original dimensions of provider label PDFs. Keep the supplier-pack entry on the PO.

Confirm which additional carrier or customs documents we want to support: bill of lading, air waybill, commercial invoice, customs declaration and proof of delivery. Their requirements depend on the booked service and route; do not promise them for every shipment or substitute the supplier invoice for a commercial invoice.

Source audit: document kinds in `src/db/schema.ts`, packet composition in `src/server/shipment-packet.ts`, templates in `src/documents/shipping-model.ts`, and product label options in `src/lib/packing-requirements.ts`. This inventory defines the review scope; it does not mean every download is wired into the current shipment page.
