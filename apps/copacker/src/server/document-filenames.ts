const shipmentDocumentTitles = {
  packet: "Supplier packet",
  packing_list: "Packing list",
  checklist: "Packing checklist",
  carton_label: "Amazon carton labels",
  shipping_label: "Carrier labels",
  product_label: "Product labels"
}

// The same identity travels with a file after it leaves the app. Provider PDFs are not modified.
export function shipmentDocumentFilename(
  kind: keyof typeof shipmentDocumentTitles,
  identity: { orderReference: string; shipmentReference: string; revision: number; cartonId?: string | null }
) {
  const safe = (value: string) =>
    value
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")
      .replace(/\s+/g, " ")
      .trim()
  return (
    [
      shipmentDocumentTitles[kind],
      safe(identity.orderReference),
      safe(identity.shipmentReference),
      `rev ${identity.revision}`,
      ...(identity.cartonId ? [safe(identity.cartonId)] : [])
    ].join(" - ") + ".pdf"
  )
}
