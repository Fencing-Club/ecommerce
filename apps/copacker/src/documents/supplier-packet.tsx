import { combinePdfs } from "@repo/aisle/documents"
import type { DocumentSettings, ShippingDocumentData } from "./shipping-model"
import { renderShippingDocument, ShippingPdf } from "./shipping-pdf"

// The label files a packet carries, each in its provider's original page geometry.
export type PacketLabels = { product?: Uint8Array[]; carton?: Uint8Array[]; carrier?: Uint8Array[] }

/**
 * The supplier packet, in the order the supplier works: the checklist of tasks, the product labels that go on each unit
 * before packing, the packing list for filling and weighing the cartons, then the Amazon and carrier labels for the
 * sealed cartons. The packing list already pairs each carton with its labels, so the separate carton label reference
 * stays out. Label pages keep their original geometry.
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
  const checklist = await page("checklist")
  const packing = await page("packing")
  return combinePdfs([
    checklist,
    ...(labels.product ?? []),
    packing,
    ...(labels.carton ?? []),
    ...(labels.carrier ?? [])
  ])
}
