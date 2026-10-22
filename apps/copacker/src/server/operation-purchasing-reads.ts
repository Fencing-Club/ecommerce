import { catalogReadOperations, poReadOperations } from "@repo/copacker-contract"
import { itemSchema } from "@repo/copacker-orders"
import { orderDestination } from "@repo/copacker-packing-rules"
import { inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { shipments } from "@/db/schema"
import { can } from "@/lib/access"
import { priceBreakSchema, quantityRulesSchema } from "@/lib/catalog-pricing"
import { forwarderOrders, visibleOrders } from "./access"
import { catalogEditor, catalogList, supplierCustomers } from "./catalogs"
import { CliError } from "./cli-auth"
import { listPartners } from "./partners"
import type { Session } from "./workspace-session"

// A narrow projection of the existing line schema excludes nested supplier quotes and other monetary snapshots.
const line = z.strictObject({
  ...z.object(itemSchema.shape).pick({
    id: true,
    variantId: true,
    name: true,
    variant: true,
    buyerSku: true,
    supplierSku: true,
    pieces: true,
    piecesPerSet: true,
    receiver: true,
    instructions: true,
    prepCategory: true,
    suffocationWarning: true,
    skuLabel: true
  }).shape,
  unitPriceMinor: itemSchema.shape.unitPrice.nullable()
})
export const poDefinitions = poReadOperations(line)
export const catalogDefinitions = catalogReadOperations(priceBreakSchema, quantityRulesSchema)

export async function readPartners(s: Session) {
  if (s.org.kind === "supplier") {
    return (await supplierCustomers(s.org.id)).map((row) => ({
      id: row.id,
      type: "customer" as const,
      name: row.name,
      relationshipStatus: "joined" as const,
      email: null,
      addressIds: [],
      catalogId: can(s, "catalogs") && can(s, "prices") ? row.catalogId : null,
      leadTimeDays: null,
      revision: null,
      allowedActions: ["partners.show"]
    }))
  }
  return (await listPartners(s.org.id)).map((row) => {
    const partner = row.type === "supplier" ? row.supplier : row.forwarder
    const joined = row.type === "supplier" ? row.supplier.supplierOrgId !== null : row.forwarder.forwarderOrgId !== null
    let relationshipStatus = "not_invited"
    if (partner.invitationHash) {
      relationshipStatus = partner.expired ? "expired" : "invited"
    }
    if (joined) {
      relationshipStatus = "joined"
    }
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      relationshipStatus,
      email: partner.email,
      addressIds: partner.addresses.map((address) => address.id),
      catalogId: null,
      leadTimeDays: row.type === "supplier" ? row.supplier.leadTimeDays : null,
      revision: null,
      allowedActions: ["partners.show"]
    }
  })
}

export async function readCatalog(s: Session, id: string) {
  const result = await catalogEditor(s.org.id, id)
  if (!result?.catalog) {
    throw new CliError("not_found", "Catalog not found.", 404)
  }
  return {
    ...result.catalog,
    customerIds: result.customers.filter((row) => row.assigned).map((row) => row.id),
    products: result.entries.map((row) => ({
      variantId: row.productId,
      priceMinor: row.priceMinor,
      priceBreaks: row.priceBreaks,
      quantityRules: row.quantityRules
    })),
    allowedActions: ["catalog.show"]
  }
}
export async function readCatalogs(s: Session) {
  return Promise.all((await catalogList(s.org.id)).map((row) => readCatalog(s, row.id)))
}

function purchaseOrderState(status: string) {
  switch (status) {
    case "draft":
      return "draft"
    case "submitted":
      return "sent"
    case "closed":
      return "closed"
    default:
      throw new CliError("source_invalid", "A purchase order has an unsupported stored status.", 409)
  }
}

export async function readPurchaseOrders(s: Session) {
  const rows = s.org.kind === "forwarder" ? await forwarderOrders(s) : await visibleOrders(s)
  const ids = rows.map(({ order }) => order.id)
  const shipmentRows = ids.length
    ? await db()
        .select({ id: shipments.id, poId: shipments.orderId })
        .from(shipments)
        .where(inArray(shipments.orderId, ids))
    : []
  const prices = s.org.kind !== "forwarder" && can(s, "prices")
  return rows.map(({ order }) => ({
    id: order.id,
    revision: order.revision,
    state: purchaseOrderState(order.status),
    reference: order.data.reference,
    supplierId: order.supplierId,
    destination: orderDestination(order.data),
    deliveryId: order.data.deliveryId ?? null,
    via: order.data.via ?? null,
    currency: order.data.currency,
    dueDate: order.data.dueDate ?? null,
    readyDate: order.data.readyDate ?? null,
    paymentTerms: prices ? order.data.paymentTerms : null,
    notes: s.org.kind === "forwarder" ? "" : order.data.notes,
    lines: order.data.items.map((item) =>
      line.parse({
        id: item.id,
        variantId: item.variantId,
        name: item.name,
        variant: item.variant,
        buyerSku: item.buyerSku,
        supplierSku: item.supplierSku,
        pieces: item.pieces,
        piecesPerSet: item.piecesPerSet,
        receiver: item.receiver,
        instructions: item.instructions,
        prepCategory: item.prepCategory,
        suffocationWarning: item.suffocationWarning,
        skuLabel: item.skuLabel,
        unitPriceMinor: prices ? item.unitPrice : null
      })
    ),
    adjustments: prices
      ? (order.data.adjustments ?? []).map((row) => ({ description: row.description, amountMinor: row.amount }))
      : null,
    shipmentIds: shipmentRows.filter((row) => row.poId === order.id).map((row) => row.id),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    allowedActions: ["po.show"]
  }))
}
