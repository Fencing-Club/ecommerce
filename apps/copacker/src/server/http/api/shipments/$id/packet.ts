import { combinePdfs } from "@repo/copacker-shipments/documents"
import { z } from "zod"
import { session } from "@/server/auth"
import { shipmentDocumentFilename } from "@/server/document-filenames"
import { errorTextResponse, StatusError } from "@/server/errors"
import { fileResponse } from "@/server/http-response"
import { lineLabelFiles, warningLabelFile } from "@/server/product-barcodes"
import { releasedPacket } from "@/server/shipment-packet"
import { getFile } from "@/server/storage"

// Provider artwork retains its original page geometry. Reference documents render from the checked snapshot in the browser.
export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    return await packet(request, context)
  } catch (error) {
    if (error instanceof StatusError) {
      return errorTextResponse(error.key, error.status)
    }
    throw error
  }
}

async function packet(request: Request, context: { params: { id: string } }) {
  const query = new URL(request.url).searchParams
  const section = z
    .enum(["verify", "carton_labels", "carrier_labels", "pallet_labels", "product_labels"])
    .safeParse(query.get("section"))
  if (!section.success) {
    return new Response("Unknown packet section", { status: 400 })
  }
  const s = await session()
  const { id } = context.params
  const { shipment, labelOrder, docs, labels, version } = await releasedPacket(s, id, query.get("version") ?? undefined)
  if (section.data === "verify") {
    return new Response(null, { status: 204 })
  }
  const included = new Set(shipment.packing?.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)))
  const files: Uint8Array[] = []
  if (section.data === "product_labels") {
    files.push(
      ...(
        await lineLabelFiles(
          labelOrder,
          labels.filter((label) => included.has(label.itemId))
        )
      ).map((label) => label.bytes)
    )
    const warnings = await warningLabelFile(labelOrder.data.items.filter((item) => included.has(item.id)))
    if (warnings) {
      files.push(warnings.bytes)
    }
  } else {
    const kind = (
      { carton_labels: "carton_label", carrier_labels: "shipping_label", pallet_labels: "pallet_label" } as const
    )[section.data]
    if (kind !== "shipping_label" || shipment.transport?.carrierLabels === "per_carton") {
      const selected = docs
        .filter((doc) => doc.shipmentId === id && doc.shipmentRevision === shipment.revision && doc.kind === kind)
        .toSorted((a, b) => (a.cartonId ?? "").localeCompare(b.cartonId ?? "", undefined, { numeric: true }))
      files.push(...(await Promise.all(selected.map((doc) => getFile(doc.objectKey)))))
    }
  }
  if (!files.length) {
    return errorTextResponse("packetNoLabelsRequired", 404)
  }
  const bytes = files.length === 1 ? files[0]! : await combinePdfs(files)
  await releasedPacket(s, id, version)
  const filename = shipmentDocumentFilename(
    (
      {
        product_labels: "product_label",
        carton_labels: "carton_label",
        carrier_labels: "shipping_label",
        pallet_labels: "pallet_label"
      } as const
    )[section.data],
    {
      orderReference: labelOrder.data.reference,
      shipmentReference: shipment.amazonShipmentId ?? shipment.id,
      revision: shipment.revision
    }
  )
  return fileResponse(Buffer.from(bytes), { filename, contentType: "application/pdf" })
}
