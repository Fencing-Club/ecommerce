import { combinePdfs } from "@repo/aisle/documents"
import type { DocumentSettings, ShippingDocumentData } from "./shipping-model"
import { renderShippingDocument, ShippingPdf } from "./shipping-pdf"

// The label files a packet carries, each in its provider's original page geometry.
export type PacketLabels = { product?: Uint8Array[]; carton?: Uint8Array[]; carrier?: Uint8Array[] }

/**
 * The supplier packet: the packing list, the packing checklist, the carton labels (Amazon's, then the carrier's), then
 * the product labels. The packing list already pairs each carton with its labels, so the separate carton label
 * reference stays out. Label pages keep their original geometry.
 */
export async function renderSupplierPacket(
  data: ShippingDocumentData,
  settings: DocumentSettings,
  labels: PacketLabels,
  fontBase?: string
) {
  const page = async (kind: "packing" | "checklist") => {
    const blob = await renderShippingDocument(<ShippingPdf data={data} kind={kind} settings={settings} />, fontBase)
    return new Uint8Array(await blob.arrayBuffer())
  }
  const packing = await page("packing")
  const checklist = await page("checklist")
  return combinePdfs([
    packing,
    checklist,
    ...(labels.carton ?? []),
    ...(labels.carrier ?? []),
    ...(labels.product ?? [])
  ])
}
