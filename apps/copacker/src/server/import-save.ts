import { randomUUID } from "node:crypto"
import { destinationSchema, orderInputSchema } from "@repo/copacker-orders"
import { receiverFor } from "@repo/copacker-packing-rules"
import { and, eq } from "drizzle-orm"
import invariant from "tiny-invariant"
import { z } from "zod"
import { db } from "@/db"
import { poImports } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { chargeInMinorUnits, importTotals, priceInMinorUnits } from "@/lib/import-totals"
import { requireBuyer } from "./authorization"
import { importProposalSchema } from "./import-proposal"
import { prepareOrder, persistOrder } from "./orders"
import type { Session } from "./workspace-session"

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
    dueDate: orderInputSchema.shape.dueDate,
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
    throw new LocalizedError("importNotFound")
  }
  if (record.status === "saved" && record.orderId) {
    return { id: record.orderId }
  }
  if (record.status !== "review" || record.revision !== input.revision) {
    throw new LocalizedError("importChanged")
  }
  const proposal = importProposalSchema.parse(record.proposal)
  if (!proposal.currency) {
    throw new LocalizedError("confirmCurrency")
  }
  const items = proposal.items.map((item, index) => {
    if (!item.selectedVariantId || item.pieces === null || item.piecesPerSet === null || item.pricePerPiece === null) {
      throw new LocalizedError("resolveImportLine", { line: index + 1 })
    }
    const unitPrice = priceInMinorUnits(item.pricePerPiece)
    if (item.sourceLineTotal !== null && priceInMinorUnits(item.sourceLineTotal) !== item.pieces * unitPrice) {
      throw new LocalizedError("importLineTotalDiffers", { line: index + 1 })
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
      instructions: "",
      receiver: receiverFor(input.destination)
    }
  })
  const adjustments = proposal.adjustments.map((adjustment) => {
    if (adjustment.amount === null) {
      throw new LocalizedError("confirmAdjustments")
    }
    return { description: adjustment.description, amount: chargeInMinorUnits(adjustment.amount) }
  })
  const { destination: _, ...order } = input
  const proposed = orderInputSchema.parse({ ...order, currency: proposal.currency, items, adjustments })
  // The document's total must be an amount, and the review's totals must make it, as the review showed.
  if (proposal.documentTotal !== null) {
    const documentTotal = priceInMinorUnits(proposal.documentTotal)
    const totals = importTotals(proposal)
    invariant(totals, "Every line and charge has its amount by now")
    if (totals.total !== documentTotal) {
      throw new LocalizedError("documentTotalDiffers")
    }
  }
  const prepared = await prepareOrder(s, proposed)
  if (
    prepared.shopifyDomain !== record.shopifyDomain ||
    (record.amazonSellerId && prepared.amazonSellerId !== record.amazonSellerId)
  ) {
    throw new LocalizedError("merchantChangedImport")
  }
  const saved = await db().transaction(async (tx) => {
    const [current] = await tx.select().from(poImports).where(scope).for("update")
    if (current?.status === "saved" && current.orderId) {
      return { id: current.orderId }
    }
    if (!current || current.status !== "review" || current.revision !== input.revision) {
      throw new LocalizedError("importChanged")
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
