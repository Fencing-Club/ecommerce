import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { orderInputSchema, packingSchema } from "@repo/copacker-shipments"
import { matchLabels } from "@repo/copacker-shipments/labels"
import { transportSchema } from "@repo/copacker-shipments/transport"
import { PDFDocument } from "pdf-lib"
import { z } from "zod"
import {
  defaultDocumentSettings,
  documentSettingsSchema,
  shippingPdfFilename,
  shippingTotals
} from "../src/documents/shipping-model"
import { renderShippingDocument, ShippingPdf } from "../src/documents/shipping-pdf"
import { shippingDocumentSnapshot } from "../src/documents/shipping-snapshot"
import { renderSupplierPacket } from "../src/documents/supplier-packet"

// Local, read-only export: input is an audited snapshot, never a live database or a new Amazon booking.
const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) {
  throw new Error("Usage: export:shipment-packet <snapshot.json> <output-directory>")
}
const input = z
  .object({
    company: z.string().min(1),
    supplier: z.string().min(1),
    shipmentId: z.string().regex(/^STAR-[A-Z0-9]+$/),
    revision: z.number().int().positive(),
    generatedDate: z.iso.date(),
    order: orderInputSchema,
    packing: packingSchema,
    transport: transportSchema,
    destination: z.object({ name: z.string().min(1), address: z.array(z.string().min(1)).min(1) }),
    originalLabels: z.string().min(1),
    settings: documentSettingsSchema.default(defaultDocumentSettings),
    evidence: z.object({ verifiedAt: z.iso.datetime(), source: z.string().min(1) })
  })
  .parse(JSON.parse(await readFile(inputPath, "utf8")))
if (input.transport.carrierLabels !== "none" || input.order.via || input.transport.handoff !== "supplier") {
  throw new Error("This export requires a direct supplier handoff without separate carrier labels")
}
const sourcePath = resolve(dirname(resolve(inputPath)), input.originalLabels)
const original = new Uint8Array(await readFile(sourcePath))
// SSCC-to-carton assignments come from the original PDF's SKU, FNSKU and quantities, never its page order.
const assignments = await matchLabels([{ name: "original.pdf", data: original }], input.order, input.packing)
const data = shippingDocumentSnapshot({
  ...input,
  labels: assignments.map((label) => ({ ...label, amazonShipmentId: input.shipmentId }))
})
if (data.network !== "awd") {
  throw new Error("Original-label verification currently supports AWD exports")
}
const fontBase = fileURLToPath(new URL("../public/document-fonts", import.meta.url))
await mkdir(outputPath, { recursive: true })
const documents: { name: string; bytes: Uint8Array }[] = []
for (const kind of ["packing", "checklist", "reference"] as const) {
  const blob = await renderShippingDocument(ShippingPdf({ data, kind, settings: input.settings }), fontBase)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const name = shippingPdfFilename(data, kind, input.settings)
  await writeFile(resolve(outputPath, name), bytes)
  documents.push({ name, bytes })
}
const originalName = `Amazon-carton-labels-${input.shipmentId}-original.pdf`
await writeFile(resolve(outputPath, originalName), original)
const packetName = `Supplier-packet-${data.order}-${data.shipment}-r${data.revision}-${input.settings.language}-${input.settings.paper}.pdf`
// The same page order as the app’s supplier packet: packing list, checklist, then the original carton labels.
const packet = await renderSupplierPacket(data, input.settings, { carton: [original] }, fontBase)
await writeFile(resolve(outputPath, packetName), packet)
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const manifest = {
  evidence: input.evidence,
  shipment: data.shipment,
  revision: data.revision,
  settings: input.settings,
  totals: shippingTotals(data),
  originalLabelsSha256: hash(original),
  assignments: assignments.map(({ cartonId, labelNumber, page }) => ({ cartonId, labelNumber, originalPage: page })),
  files: await Promise.all(
    [...documents, { name: originalName, bytes: original }, { name: packetName, bytes: packet }].map(
      async ({ name, bytes }) => ({ name, pages: (await PDFDocument.load(bytes)).getPageCount(), sha256: hash(bytes) })
    )
  )
}
await writeFile(resolve(outputPath, "verification.json"), JSON.stringify(manifest, null, 2) + "\n")
process.stdout.write(JSON.stringify({ directory: resolve(outputPath), ...manifest }, null, 2) + "\n")
