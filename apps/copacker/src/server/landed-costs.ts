import { itemTotal, orderTotal, type OrderInput } from "@repo/copacker-shipments"
import { and, asc, eq, ne, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { landedCosts, orders } from "@/db/schema"
import { AccessError, LocalizedError } from "@/i18n/errors"
import { accessibleOrder } from "./access"
import { amazonFreightByOrder } from "./amazon-shipments"
import { sentDates } from "./sent-dates"
import type { Session } from "./workspace-session"

// Landed costs are the buyer's own record. Session is imported as a type only, so the worker can load this module;
// otherwise this is authorization.ts's requireBuyer.
function requireBuyer(s: Session) {
  if (s.org.kind !== "buyer") {
    throw new AccessError("buyerWorkspaceRequired")
  }
}

export const landedCostKinds = { freight: "Freight", duty: "Duty", other: "Other" } as const

export const landedCostInputSchema = z.strictObject({
  orderId: z.uuid(),
  kind: z.enum(["freight", "duty", "other"]),
  description: z.string().trim().max(200).default(""),
  // In the PO's currency, in minor units.
  amount: z.number().int().min(1).max(100000000)
})

// Records a freight, duty or other bill against a PO. Buyers only: the supplier never sees landed costs.
export async function addLandedCost(s: Session, raw: unknown) {
  requireBuyer(s)
  const input = landedCostInputSchema.parse(raw)
  const { order } = await accessibleOrder(s, input.orderId)
  const [row] = await db()
    .insert(landedCosts)
    .values({
      orderId: order.id,
      kind: input.kind,
      description: input.description,
      amountMinor: input.amount,
      createdBy: s.user.id
    })
    .returning({ id: landedCosts.id })
  return row!
}

export async function removeLandedCost(s: Session, id: string) {
  requireBuyer(s)
  const [row] = await db()
    .select({ id: landedCosts.id })
    .from(landedCosts)
    .innerJoin(orders, eq(orders.id, landedCosts.orderId))
    .where(and(eq(landedCosts.id, z.uuid().parse(id)), eq(orders.buyerOrgId, s.org.id)))
  if (!row) {
    throw new LocalizedError("landedCostNotFound")
  }
  await db().delete(landedCosts).where(eq(landedCosts.id, row.id))
}

export async function orderLandedCosts(orderId: string) {
  return db()
    .select({
      id: landedCosts.id,
      kind: landedCosts.kind,
      description: landedCosts.description,
      amountMinor: landedCosts.amountMinor
    })
    .from(landedCosts)
    .where(eq(landedCosts.orderId, orderId))
    .orderBy(asc(landedCosts.createdAt))
}

// How much a PO's landed costs and charges add to its products' price, as a share of that price: 0.12 means each
// unit cost 12% more to land than the supplier charged. Charges and discounts on the PO count too.
export function landedMarkup(order: Pick<OrderInput, "items" | "adjustments">, landedMinor: number) {
  const products = order.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)
  if (products <= 0) {
    return null
  }
  return (orderTotal(order) - products + landedMinor) / products
}

// Each product's landed markup, from the latest sent PO for it that has landed costs recorded. A PO whose freight
// hasn't been entered yet doesn't hide the markup of the one before it.
export function landedMarkups(
  list: { data: Pick<OrderInput, "items" | "adjustments">; landedMinor: number; sentAt: Date }[]
) {
  const markups = new Map<string, number>()
  for (const order of list
    .filter((entry) => entry.landedMinor > 0)
    .toSorted((a, b) => b.sentAt.getTime() - a.sentAt.getTime())) {
    // Only shared PO costs are spread across products. A service assigned to a product stays with that product.
    const markup = landedMarkup(
      { ...order.data, items: order.data.items.map((item) => ({ ...item, supplierCharges: [] })) },
      order.landedMinor
    )
    if (markup === null) {
      continue
    }
    for (const item of order.data.items) {
      if (!markups.has(item.variantId)) {
        const productCost = item.pieces * item.unitPrice
        markups.set(item.variantId, markup + (productCost > 0 ? (itemTotal(item) - productCost) / productCost : 0))
      }
    }
  }
  return markups
}

// What landed markups read besides the landed costs themselves: the buyer's POs (drafts don't count), when each was
// sent, and the freight Amazon charged for their shipments.
type MarkupInputs = {
  orders: { id: string; status: "draft" | "submitted" | "closed"; data: OrderInput; createdAt: Date }[]
  sentAt: ReadonlyMap<string, Date>
  freight: { orderId: string; currency: string; freightMinor: number }[]
}

async function markupInputs(orgId: string): Promise<MarkupInputs> {
  const [list, sentAt, freight] = await Promise.all([
    db()
      .select({ id: orders.id, status: orders.status, data: orders.data, createdAt: orders.createdAt })
      .from(orders)
      .where(and(eq(orders.buyerOrgId, orgId), ne(orders.status, "draft"))),
    sentDates(orgId),
    amazonFreightByOrder(orgId)
  ])
  return { orders: list, sentAt, freight }
}

// The buyer's landed markups by variant, from their sent and closed POs: the landed costs recorded on each, and the
// freight Amazon charged for its shipments (in the PO's currency). The Overview passes the POs, sent dates and freight
// it has already read, so only the landed costs are read here; called without them, it reads them too.
export async function landedMarkupsFor(orgId: string, read?: MarkupInputs) {
  const [totals, inputs] = await Promise.all([
    db()
      .select({ orderId: landedCosts.orderId, amount: sql<number>`sum(${landedCosts.amountMinor})`.mapWith(Number) })
      .from(landedCosts)
      .innerJoin(orders, eq(orders.id, landedCosts.orderId))
      .where(eq(orders.buyerOrgId, orgId))
      .groupBy(landedCosts.orderId),
    read ?? markupInputs(orgId)
  ])
  const list = inputs.orders.filter((order) => order.status !== "draft")
  const landed = new Map(totals.map((row) => [row.orderId, row.amount]))
  const currencies = new Map(list.map((order) => [order.id, order.data.currency]))
  for (const row of inputs.freight) {
    if (currencies.get(row.orderId) === row.currency) {
      landed.set(row.orderId, (landed.get(row.orderId) ?? 0) + row.freightMinor)
    }
  }
  return landedMarkups(
    list
      .filter((order) => landed.has(order.id))
      .map((order) => ({
        data: order.data,
        landedMinor: landed.get(order.id)!,
        sentAt: inputs.sentAt.get(order.id) ?? order.createdAt
      }))
  )
}
