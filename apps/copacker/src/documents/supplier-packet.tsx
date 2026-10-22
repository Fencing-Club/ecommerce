import { combinePdfs } from "@repo/copacker-shipments/documents"
import type { DocumentSettings, ShippingDocumentData } from "@repo/copacker-shipments/shipping-model"
import { renderShippingDocument, ShippingPdf } from "./shipping-pdf"

// The label files a packet carries, each in its provider's original page geometry.
export type PacketLabels = {
  product?: Uint8Array[]
  carton?: Uint8Array[]
  carrier?: Uint8Array[]
  pallet?: Uint8Array[]
}

/**
 * The supplier packet: the packing list, the packing checklist, the carton label reference, the carton labels (Amazon's,
 * then the carrier's), the pallet labels, then the product labels. The reference lists every carton with its labels
 * in one table, right before the labels it matches, and only when there are carton labels. Label pages keep their
 * original geometry.
 */
export async function renderSupplierPacket(
  data: ShippingDocumentData,
  settings: DocumentSettings,
  labels: PacketLabels,
  fontBase?: string
) {
  const page = async (kind: "packing" | "checklist" | "reference") => {
    const blob = await renderShippingDocument(<ShippingPdf data={data} kind={kind} settings={settings} />, fontBase)
    return new Uint8Array(await blob.arrayBuffer())
  }
  const packing = await page("packing")
  const checklist = await page("checklist")
  const cartonLabels = [...(labels.carton ?? []), ...(labels.carrier ?? [])]
  return combinePdfs([
    packing,
    checklist,
    ...(cartonLabels.length ? [await page("reference")] : []),
    ...cartonLabels,
    ...(labels.pallet ?? []),
    ...(labels.product ?? [])
  ])
}
