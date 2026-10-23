import { createHash } from "node:crypto"
import { artifactSchema, defineOperation, fileMetadataSchema, readMetadata } from "@repo/copacker-contract"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { operationReceipts, supplierCatalogImports } from "@/db/schema"
import { can } from "@/lib/access"
import { csvTable } from "@/lib/csv-table"
import { CliError } from "./cli-auth"
import { readInventory } from "./operation-product-reads"
import {
  fileLimit,
  uploadReceipt,
  prepareUpload,
  uploadedBytes,
  transferKey,
  saveExport,
  transferReceipt
} from "./operation-transfers"
import { previewImport, commitImport } from "./product-import"
import { readSheet, sheetRows, sheetCsv, sheetWorkbook } from "./product-sheet"
import { supplierCountsInput, saveSupplierCounts } from "./supplier-counts"
import { productList } from "./supplier-products"
import type { Session } from "./workspace-session"

const file = fileMetadataSchema.extend({ size: z.number().int().positive().max(fileLimit) })
const importInput = z.discriminatedUnion("phase", [
  z.strictObject({ phase: z.literal("prepare"), intentId: z.uuid(), file, locationId: z.string().optional() }),
  z.strictObject({
    phase: z.literal("complete"),
    intentId: z.uuid(),
    handoffId: z.uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
])
const preview = z.strictObject({
  previewId: z.uuid(),
  expiresAt: z.iso.datetime(),
  revisionHash: z.string(),
  products: z.number().int(),
  variants: z.number().int(),
  stockCounts: z.number().int(),
  changes: z
    .strictObject({ created: z.number().int(), updated: z.number().int(), unchanged: z.number().int() })
    .nullable(),
  counts: z.array(
    z.strictObject({
      variantId: z.uuid(),
      before: z.number().int(),
      quantity: z.number().int(),
      revision: z.number().int()
    })
  )
})
function metadata(operation: string, inventory = false) {
  return {
    ...readMetadata(operation, [inventory ? "inventory:write" : "products:write"], ["supplier"]),
    effects: [
      {
        kind: "local_write" as const,
        description: "Prepare a private import or export, or apply reviewed supplier data."
      }
    ],
    limits: { maxInputBytes: 1048576, maxFileBytes: fileLimit },
    execution: { kind: "mutation" as const, idempotent: true, confirmation: false, readBranches: [] }
  }
}
const apply = z.strictObject({ previewId: z.uuid(), reviewed: z.literal(true) })
const applied = z.strictObject({ imported: z.boolean() })
const exportInput = z.union([
  z.strictObject({
    action: z.literal("generate").default("generate"),
    selection: z.strictObject({}).default({}),
    fileFormat: z.enum(["csv", "xlsx"]).default("csv")
  }),
  z.strictObject({ action: z.literal("read"), exportId: z.uuid() })
])
function exportMetadata(operation: string, inventory = false) {
  return {
    ...metadata(operation, inventory),
    accessPolicy: readMetadata(operation, [inventory ? "inventory:read" : "products:read"], ["supplier"]).accessPolicy,
    execution: {
      ...metadata(operation, inventory).execution,
      readBranches: [{ field: "action" as const, value: "read" as const }]
    }
  }
}
export const importDefinitions = {
  "product.import": defineOperation(metadata("product.import"), importInput, z.union([uploadReceipt, preview])),
  "inventory.import": defineOperation(
    metadata("inventory.import", true),
    importInput,
    z.union([uploadReceipt, preview])
  ),
  "product.import.apply": defineOperation(metadata("product.import.apply"), apply, applied),
  "inventory.import.apply": defineOperation(metadata("inventory.import.apply", true), apply, applied),
  "product.import.show": defineOperation(
    readMetadata("product.import.show", ["products:read"], ["supplier"]),
    z.strictObject({ id: z.uuid() }),
    preview
  ),
  "inventory.import.show": defineOperation(
    readMetadata("inventory.import.show", ["inventory:read"], ["supplier"]),
    z.strictObject({ id: z.uuid() }),
    preview
  ),
  "product.export": defineOperation(exportMetadata("product.export"), exportInput, artifactSchema),
  "inventory.export": defineOperation(exportMetadata("inventory.export", true), exportInput, artifactSchema),
  "product.template": defineOperation(
    exportMetadata("product.template"),
    z.strictObject({ fileFormat: z.enum(["csv", "xlsx"]).default("csv") }),
    artifactSchema
  )
}
function inventoryRows(s: Session, bytes: Uint8Array) {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new CliError("invalid_input", "Inventory CSVs must use UTF-8 text.")
  }
  const rows = csvTable(text.replace(/^\uFEFF/, ""))
  const header = rows.shift()
  if (header?.join(",") !== "variantId,locationId,quantity,expectedRevision") {
    throw new CliError("invalid_input", "Use the inventory export's four columns unchanged.")
  }
  const parsed = supplierCountsInput.safeParse({
    counts: rows
      .filter((row) => row.some(Boolean))
      .map((row) => {
        if (
          row.length !== 4 ||
          row[1] !== `supplier:${s.org.id}` ||
          !/^-?\d+$/.test(row[2] ?? "") ||
          !/^\d+$/.test(row[3] ?? "")
        ) {
          throw new CliError(
            "invalid_input",
            "Each count needs this supplier's location, an integer quantity and its revision."
          )
        }
        return { id: row[0], onHand: Number(row[2]), expectedRevision: Number(row[3]) }
      })
  })
  if (!parsed.success) {
    throw new CliError("invalid_input", "Inventory rows require valid variant IDs, quantities and positive revisions.")
  }
  return parsed.data
}
async function content(s: Session, id: string, inventory: boolean) {
  const value = await uploadedBytes(s, id, inventory ? "inventory.import" : "product.import")
  if (inventory) {
    return { ...value, counts: inventoryRows(s, value.bytes), products: [] }
  }
  const products = await readSheet({ name: value.upload.file.filename, bytes: value.bytes })
  if (products.some((product) => product.variants.some((variant) => variant.onHand !== null))) {
    if (!can(s, "inventory", "edit")) {
      throw new CliError("forbidden", "The file contains stock counts; inventory editing access is required.", 403)
    }
    if (value.upload.locationId !== `supplier:${s.org.id}`) {
      throw new CliError("invalid_location", "A file with stock counts requires this supplier's location.", 409)
    }
  }
  return { ...value, products, counts: null }
}
export async function importFile(s: Session, input: z.infer<typeof importInput>, inventory: boolean) {
  if (input.phase === "prepare") {
    const csv = input.file.filename.toLowerCase().endsWith(".csv") && input.file.mediaType === "text/csv"
    const xlsx =
      input.file.filename.toLowerCase().endsWith(".xlsx") &&
      input.file.mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if (!csv && (inventory || !xlsx)) {
      throw new CliError(
        "invalid_input",
        inventory ? "Inventory imports require CSV." : "Product imports require CSV or XLSX."
      )
    }
    return prepareUpload(s, input)
  }
  const data = await content(s, input.handoffId, inventory)
  if (data.upload.intentId !== input.intentId || data.upload.file.sha256 !== input.sha256) {
    throw new CliError("invalid_upload", "The completed file belongs to another intent.", 409)
  }
  // uploadedBytes locks the original prepare receipt until this mutation commits.
  // A handoff has one immutable preview even when completion uses another execution key.
  const previous = await findImport(s, input.handoffId, inventory)
  if (previous) {
    return previous
  }
  const summary = inventory ? null : await previewImport(s.org.id, data.products)
  const counts = data.counts ? await saveSupplierCounts(s, data.counts, true) : []
  return {
    previewId: input.handoffId,
    expiresAt: data.upload.expiresAt,
    revisionHash: summary?.revisionHash ?? createHash("sha256").update(JSON.stringify(data.counts)).digest("hex"),
    changes: summary?.variants ?? null,
    counts,
    products: summary?.products ?? 0,
    variants: summary
      ? summary.variants.created + summary.variants.updated + summary.variants.unchanged
      : data.counts!.counts.length,
    stockCounts:
      data.counts?.counts.length ??
      data.products.flatMap((product) => product.variants).filter((variant) => variant.onHand !== null).length
  }
}
async function findImport(s: Session, id: string, inventory: boolean) {
  const [receipt] = await db()
    .select()
    .from(operationReceipts)
    .where(
      and(
        eq(operationReceipts.userId, s.user.id),
        eq(operationReceipts.orgId, s.org.id),
        eq(operationReceipts.operation, inventory ? "inventory.import" : "product.import"),
        sql`${operationReceipts.result}->>'previewId' = ${id}`
      )
    )
    .orderBy(operationReceipts.createdAt, operationReceipts.key)
    .limit(1)
  return receipt ? preview.parse(receipt.result) : null
}
export async function readImport(s: Session, id: string, inventory: boolean) {
  const receipt = await findImport(s, id, inventory)
  if (!receipt) {
    throw new CliError("not_found", "Import preview not found.", 404)
  }
  return receipt
}
export async function applyImport(s: Session, id: string, inventory: boolean) {
  const reviewed = await readImport(s, id, inventory)
  const data = await content(s, id, inventory)
  // The original upload identity makes even a separately keyed apply harmless to replay.
  const objectKey = transferKey(s, id)
  const [inserted] = await db()
    .insert(supplierCatalogImports)
    .values({
      supplierOrgId: s.org.id,
      objectKey,
      filename: data.upload.file.filename,
      createdBy: s.user.id,
      rowCount: reviewed.variants
    })
    .onConflictDoNothing()
    .returning({ id: supplierCatalogImports.id })
  if (!inserted) {
    return { imported: false }
  }
  if (inventory) {
    await saveSupplierCounts(s, data.counts)
  } else {
    await db().transaction((tx) => commitImport(tx, s.org.id, data.products, reviewed.revisionHash))
  }
  return { imported: true }
}
export async function exportFile(s: Session, format: "csv" | "xlsx", kind: "product" | "inventory" | "template") {
  if (kind === "inventory") {
    const inventory = await readInventory(s)
    const rows = inventory.items.filter((row) => row.tracking && row.quantityState === "on_hand")
    const csv = [
      "variantId,locationId,quantity,expectedRevision",
      ...rows.map((row) => [row.variantId, row.locationId, row.quantity, row.revision].join(","))
    ].join("\r\n")
    return saveExport(s, new TextEncoder().encode(csv), "inventory.csv", "text/csv")
  }
  const rows =
    kind === "template"
      ? []
      : sheetRows((await productList(s.org.id)).map((product) => ({ ...product, active: product.status === "active" })))
  const bytes =
    format === "csv" ? new TextEncoder().encode(sheetCsv(rows)) : new Uint8Array(await sheetWorkbook(rows, s.org.name))
  return saveExport(
    s,
    bytes,
    `${kind === "template" ? "product-template" : "products"}.${format}`,
    format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
}

export async function entityExport(s: Session, input: z.infer<typeof exportInput>, inventory: boolean) {
  if (input.action === "read") {
    return artifactSchema.parse(
      (await transferReceipt(s, input.exportId, inventory ? "inventory.export" : "product.export")).result
    )
  }
  if (inventory && input.fileFormat !== "csv") {
    throw new CliError("invalid_input", "Inventory exports support CSV.")
  }
  return exportFile(s, input.fileFormat, inventory ? "inventory" : "product")
}
