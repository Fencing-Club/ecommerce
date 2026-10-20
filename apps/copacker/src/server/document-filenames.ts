import { filenamePart } from "@/lib/filenames"

const shipmentDocumentTitles = {
  packet: "Supplier packet",
  packing_list: "Packing list",
  checklist: "Packing checklist",
  carton_label: "Amazon carton labels",
  pallet_label: "Amazon pallet labels",
  shipping_label: "Carrier labels",
  product_label: "Product labels"
}

// The same identity travels with a file after it leaves the app. Provider PDFs are not modified.
export function shipmentDocumentFilename(
  kind: keyof typeof shipmentDocumentTitles,
  identity: { orderReference: string; shipmentReference: string; revision: number; cartonId?: string | null }
) {
  return (
    [
      shipmentDocumentTitles[kind],
      filenamePart(identity.orderReference),
      filenamePart(identity.shipmentReference),
      `rev ${identity.revision}`,
      ...(identity.cartonId ? [filenamePart(identity.cartonId)] : [])
    ].join(" - ") + ".pdf"
  )
}
