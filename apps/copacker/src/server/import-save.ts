import { randomUUID } from "node:crypto"
import { destinationSchema, orderInputSchema, orderLine, orderTotal } from "@repo/copacker-orders"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { poImports } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { importProposalSchema, priceInMinorUnits } from "@/lib/import-proposal"
import { requireBuyer } from "./authorization"
import { shopifyFor } from "./connections"
import { requestInput } from "./errors"
import { prepareOrder, persistOrder } from "./orders"
import { lineDefaultsFor } from "./product-defaults"
import { withVariantFields } from "./product-fields"
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
  requestInput(z.uuid(), id)
  const input = requestInput(saveSchema, raw)
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
  const lines = proposal.items.map((item, index) => {
    if (!item.selectedVariantId || item.pieces === null || item.piecesPerSet === null || item.pricePerPiece === null) {
      throw new LocalizedError("resolveImportLine", { line: index + 1 })
    }
    const unitPrice = priceInMinorUnits(item.pricePerPiece)
    if (item.sourceLineTotal !== null && priceInMinorUnits(item.sourceLineTotal) !== item.pieces * unitPrice) {
      throw new LocalizedError("importLineTotalDiffers", { line: index + 1 })
    }
    return { variantId: item.selectedVariantId, pieces: item.pieces, piecesPerSet: item.piecesPerSet, unitPrice }
  })
  const adjustments = proposal.adjustments.map((adjustment) => {
    if (adjustment.amount === null) {
      throw new LocalizedError("confirmAdjustments")
    }
    const negative = adjustment.amount.startsWith("-")
    return {
      description: adjustment.description,
      amount: (negative ? -1 : 1) * priceInMinorUnits(negative ? adjustment.amount.slice(1) : adjustment.amount)
    }
  })
  // Each line starts as one added in the PO editor would, with the product's saved defaults and Amazon network, at the
  // document's quantity and price.
  const shopify = await shopifyFor(s.org.id, record.shopifyDomain)
  const [variants, defaultsFor] = await Promise.all([
    shopify
      .variants(lines.map((line) => line.variantId))
      .then((found) => withVariantFields(s.org.id, record.shopifyDomain, found)),
    lineDefaultsFor(s.org.id)
  ])
  const currency = proposal.currency
  const items = lines.map(({ variantId, ...line }, index) => {
    const variant = variants.find((candidate) => candidate?.id === variantId)
    if (!variant) {
      throw new LocalizedError("resolveImportLine", { line: index + 1 })
    }
    return { ...orderLine(variant, randomUUID(), defaultsFor(variant), currency, input.destination), ...line }
  })
  const { destination: _, ...order } = input
  const proposed = orderInputSchema.parse({ ...order, currency: proposal.currency, items, adjustments })
  if (proposal.documentTotal !== null && priceInMinorUnits(proposal.documentTotal) !== orderTotal(proposed)) {
    throw new LocalizedError("documentTotalDiffers")
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
      .set({ status: "saved", orderId: order.id, revision: current.revision + 1 })
      .where(scope)
    return { id: order.id }
  })
  return saved
}
