import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { text } from "node:stream/consumers"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { orderInputSchema } from "@repo/copacker-orders"
import { packingSchema } from "@repo/copacker-shipments"
import { matchLabels } from "@repo/copacker-shipments/labels"
import {
  defaultDocumentSettings,
  documentSettingsSchema,
  shippingPdfFilename,
  shippingTotals
} from "@repo/copacker-shipments/shipping-model"
import { shippingDocumentSnapshot } from "@repo/copacker-shipments/shipping-snapshot"
import { transportSchema } from "@repo/copacker-shipments/transport"
import { PDFDocument } from "pdf-lib"
import { z } from "zod"
import { renderShippingDocument, ShippingPdf } from "../src/documents/shipping-pdf"
import { renderSupplierPacket } from "../src/documents/supplier-packet"

// Local, read-only export of a supplier packet, from its JSON input or a shipment in the database. It never books with
// Amazon, uploads or sends anything.
const usage = [
  "Usage: export:shipment-packet <packet.json | -> <output-directory>",
  "       export:shipment-packet --shipment <id> <output-directory>",
  "       export:shipment-packet --shipment <id> --json > packet.json"
].join("\n")
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { shipment: { type: "string" }, json: { type: "boolean", default: false } }
})
const [inputPath, outputPath] = values.shipment ? [undefined, positionals[0]] : positionals
if (values.shipment ? !values.json && !outputPath : !inputPath || !outputPath || values.json) {
  throw new Error(usage)
}

const party = z.object({ name: z.string().min(1), address: z.array(z.string().min(1)) })
const packetSchema = z.object({
  company: z.string().min(1),
  supplier: z.string().min(1),
  shipmentId: z.string().min(1),
  revision: z.number().int().positive(),
  generatedDate: z.iso.date(),
  order: orderInputSchema,
  packing: packingSchema,
  transport: transportSchema,
  destination: party,
  // A PO through a forwarder: the destination is the forwarder, and this is where it sends the cartons next.
  onward: z
    .object({ destination: party, service: z.enum(["parcel", "agl", "freight", "supplier", "forwarder"]) })
    .optional(),
  // Before Amazon has the shipment: no carton labels or warehouse address yet.
  amazonPending: z.boolean().default(false),
  // Amazon's original carton labels PDF, relative to the JSON file. Its labels are matched to the cartons by SKU,
  // FNSKU and quantity.
  originalLabels: z.string().min(1).optional(),
  settings: documentSettingsSchema.default(defaultDocumentSettings),
  evidence: z.object({ verifiedAt: z.iso.datetime(), source: z.string().min(1) }).optional()
})

let raw: unknown
if (values.shipment) {
  const [{ packetFromDatabase }, { closeDatabase }] = await Promise.all([
    import("./shipment-packet-database"),
    import("../src/db/index")
  ])
  try {
    raw = await packetFromDatabase(values.shipment)
  } finally {
    await closeDatabase()
  }
} else {
  raw = JSON.parse(inputPath === "-" ? await text(process.stdin) : await readFile(inputPath!, "utf8"))
}
const input = packetSchema.parse(raw)
if (values.json) {
  process.stdout.write(JSON.stringify(input, null, 2) + "\n")
  process.exit(0)
}

let original: Uint8Array | undefined
let assignments: Awaited<ReturnType<typeof matchLabels>> = []
if (input.originalLabels) {
  if (
    input.transport.carrierLabels !== "none" ||
    input.onward ||
    input.transport.handoff !== "supplier" ||
    !/^STAR-[A-Z0-9]+$/.test(input.shipmentId)
  ) {
    throw new Error("Original labels require an AWD shipment handed off by the supplier, without carrier labels")
  }
  const base = inputPath && inputPath !== "-" ? dirname(resolve(inputPath)) : process.cwd()
  original = new Uint8Array(await readFile(resolve(base, input.originalLabels)))
  // SSCC-to-carton assignments come from the original PDF's SKU, FNSKU and quantities, never its page order.
  assignments = await matchLabels([{ name: "original.pdf", data: original }], input.order, input.packing)
}
const data = shippingDocumentSnapshot({
  ...input,
  // The packet's onward leg is what says the shipment's route stops at a forwarder.
  forwarder: Boolean(input.onward),
  labels: assignments.map((label) => ({ ...label, amazonShipmentId: input.shipmentId }))
})
if (original && data.network !== "awd") {
  throw new Error("Original-label verification currently supports AWD exports")
}
const fontBase = fileURLToPath(new URL("../public/document-fonts", import.meta.url))
await mkdir(outputPath!, { recursive: true })
const documents: { name: string; bytes: Uint8Array }[] = []
// The reference matches cartons to their labels, so it comes only with them.
for (const kind of original ? (["packing", "checklist", "reference"] as const) : (["packing", "checklist"] as const)) {
  const blob = await renderShippingDocument(ShippingPdf({ data, kind, settings: input.settings }), fontBase)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const name = shippingPdfFilename(data, kind, input.settings)
  await writeFile(resolve(outputPath!, name), bytes)
  documents.push({ name, bytes })
}
if (original) {
  const name = `Amazon-carton-labels-${input.shipmentId}-original.pdf`
  await writeFile(resolve(outputPath!, name), original)
  documents.push({ name, bytes: original })
}
const packetName = `Supplier-packet-${data.order}-${data.shipment}-r${data.revision}-${input.settings.language}-${input.settings.paper}.pdf`
// The same page order as the app's supplier packet: packing list, checklist, then the original carton labels.
const packet = await renderSupplierPacket(data, input.settings, { carton: original ? [original] : [] }, fontBase)
await writeFile(resolve(outputPath!, packetName), packet)
documents.push({ name: packetName, bytes: packet })
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const manifest = {
  ...(input.evidence && { evidence: input.evidence }),
  shipment: data.shipment,
  revision: data.revision,
  settings: input.settings,
  totals: shippingTotals(data),
  ...(original && {
    originalLabelsSha256: hash(original),
    assignments: assignments.map(({ cartonId, labelNumber, page }) => ({ cartonId, labelNumber, originalPage: page }))
  }),
  files: await Promise.all(
    documents.map(async ({ name, bytes }) => ({
      name,
      pages: (await PDFDocument.load(bytes)).getPageCount(),
      sha256: hash(bytes)
    }))
  )
}
await writeFile(resolve(outputPath!, "verification.json"), JSON.stringify(manifest, null, 2) + "\n")
process.stdout.write(JSON.stringify({ directory: resolve(outputPath!), ...manifest }, null, 2) + "\n")
