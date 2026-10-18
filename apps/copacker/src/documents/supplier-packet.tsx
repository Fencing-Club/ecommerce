import { combinePdfs } from "@repo/aisle/documents"
import type { DocumentSettings, ShippingDocumentData } from "./shipping-model"
import { renderShippingDocument, ShippingPdf } from "./shipping-pdf"

/** Assemble reference sheets and original label PDFs without changing label page geometry. */
export async function renderSupplierPacket(
  data: ShippingDocumentData,
  settings: DocumentSettings,
  labels: Uint8Array[]
) {
  const files: Uint8Array[] = []
  for (const kind of ["packing", "checklist", "reference"] as const) {
    const blob = await renderShippingDocument(<ShippingPdf data={data} kind={kind} settings={settings} />)
    files.push(new Uint8Array(await blob.arrayBuffer()))
  }
  return combinePdfs([...files, ...labels])
}
