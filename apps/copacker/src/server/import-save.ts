import { randomUUID } from "node:crypto"
import { orderInputSchema, orderTotal, destinationSchema } from "@repo/aisle"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { poImports } from "@/db/schema"
import { requireBuyer, type Session } from "./auth"
import { importProposalSchema, priceInMinorUnits } from "./import-proposal"
import { prepareOrder, persistOrder } from "./orders"

const saveSchema = z
  .object({
    revision: z.number().int().positive(),
    reviewed: z.literal(true),
    supplierId: z.uuid(),
    destination: destinationSchema,
    // The delivery address, for a PO to one of the buyer's locations.
    deliveryId: z.uuid().optional(),
    // A forwarder's address to stop at on the way.
    via: orderInputSchema.shape.via,
    reference: z.string().trim().min(1).max(80),
    dueDate: z.iso.date(),
    notes: z.string().max(8000).default("")
  })
  .strict()

export async function saveImportedOrder(s: Session, id: string, raw: unknown) {
  requireBuyer(s)
  z.uuid().parse(id)
  const input = saveSchema.parse(raw)
  const scope = and(eq(poImports.id, id), eq(poImports.orgId, s.org.id))
  const [record] = await db().select().from(poImports).where(scope)
  if (!record) {
    throw new Error("Import not found")
  }
  if (record.status === "saved" && record.orderId) {
    return { id: record.orderId }
  }
  if (record.status !== "review" || record.revision !== input.revision) {
    throw new Error("Import changed. Refresh before saving")
  }
  const proposal = importProposalSchema.parse(record.proposal)
  if (!proposal.currency) {
    throw new Error("Confirm the document currency before saving")
  }
  const items = proposal.items.map((item, index) => {
    if (!item.selectedVariantId || item.pieces === null || item.piecesPerSet === null || item.pricePerPiece === null) {
      throw new Error(`Resolve the product, quantity, pack size and price on line ${index + 1}`)
    }
    const unitPrice = priceInMinorUnits(item.pricePerPiece)
    if (item.sourceLineTotal !== null && priceInMinorUnits(item.sourceLineTotal) !== item.pieces * unitPrice) {
      throw new Error(
        `Line ${index + 1} total differs from its quantity and price. Correct the conversion before saving`
      )
    }
    return {
      id: randomUUID(),
      variantId: item.selectedVariantId,
      inventoryItemId: "gid://shopify/InventoryItem/0",
      name: item.description,
      variant: "",
      buyerSku: item.selectedVariantId,
      supplierSku: "",
      asin: "",
      fnsku: "",
      pieces: item.pieces,
      piecesPerSet: item.piecesPerSet,
      unitPrice,
      instructions: ""
    }
  })
  const adjustments = proposal.adjustments.map((adjustment) => {
    if (adjustment.amount === null) {
      throw new Error("Confirm every additional charge and discount")
    }
    const negative = adjustment.amount.startsWith("-")
    return {
      description: adjustment.description,
      amount: (negative ? -1 : 1) * priceInMinorUnits(negative ? adjustment.amount.slice(1) : adjustment.amount)
    }
  })
  const proposed = orderInputSchema.parse({ ...input, currency: proposal.currency, items, adjustments })
  if (proposal.documentTotal !== null && priceInMinorUnits(proposal.documentTotal) !== orderTotal(proposed)) {
    throw new Error("Document total differs from the reviewed items and adjustments")
  }
  const prepared = await prepareOrder(s, proposed)
  if (
    prepared.shopifyDomain !== record.shopifyDomain ||
    (record.amazonSellerId && prepared.amazonSellerId !== record.amazonSellerId)
  ) {
    throw new Error("The connected merchant account changed. Import against the correct accounts before saving")
  }
  const saved = await db().transaction(async (tx) => {
    const [current] = await tx.select().from(poImports).where(scope).for("update")
    if (current?.status === "saved" && current.orderId) {
      return { id: current.orderId }
    }
    if (!current || current.status !== "review" || current.revision !== input.revision) {
      throw new Error("Import changed. Refresh before saving")
    }
    const order = await persistOrder(tx, s, prepared)
    await tx
      .update(poImports)
      .set({ status: "saved", orderId: order.id, revision: current.revision + 1, updatedAt: new Date() })
      .where(scope)
    return { id: order.id }
  })
  return saved
}
