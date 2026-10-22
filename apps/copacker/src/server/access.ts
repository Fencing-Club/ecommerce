import { and, eq, isNull, ne, type SQL, sql } from "drizzle-orm"
import { z } from "zod"
import type { Transaction } from "@/db"
import { db } from "@/db"
import { forwarders, orders, suppliers } from "@/db/schema"
import { NotFoundError } from "@/i18n/errors"
import type { Session } from "./workspace-session"

// The POs a buyer or supplier workspace can open: every one of a buyer's own, and a supplier's sent ones for as long as
// the buyer keeps it on. The query must join suppliers on the PO's supplier.
export function orderVisibleTo(s: Session) {
  return s.org.kind === "buyer"
    ? eq(orders.buyerOrgId, s.org.id)
    : and(eq(suppliers.supplierOrgId, s.org.id), isNull(suppliers.removedAt), ne(orders.status, "draft"))
}

export async function accessibleOrder(
  s: Session,
  id: string,
  executor: Transaction | ReturnType<typeof db> = db(),
  lock = false
) {
  // A malformed id, such as /orders/abc, finds nothing, like an unknown one.
  if (!z.uuid().safeParse(id).success) {
    throw new NotFoundError()
  }
  const query = executor
    .select({ order: orders, supplier: suppliers })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(and(eq(orders.id, id), orderVisibleTo(s)))
  const [row] = lock ? await query.for("update", { of: orders }) : await query
  if (!row) {
    throw new NotFoundError()
  }
  return row
}
// A PO the workspace can open and its supplier, as accessibleOrder found them.
export type AccessibleOrder = Awaited<ReturnType<typeof accessibleOrder>>
export async function visibleOrders(s: Session) {
  return db()
    .select({ order: orders, supplier: suppliers })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(orderVisibleTo(s))
    .orderBy(orders.createdAt)
}

// The POs a forwarder's workspace handles, with the forwarder each passes through: sent ones whose route stops at a
// forwarder the workspace joined as (the PO's forwarderLeg, one of its buyer's forwarders). `only` narrows them further.
// Forwarders only read these and move shipments on; they never reach accessibleOrder, whose actions assume a supplier.
function forwarderRows(s: Session, executor: Transaction | ReturnType<typeof db>, only?: SQL) {
  return executor
    .select({
      order: orders,
      supplier: suppliers,
      forwarder: { id: forwarders.id, name: forwarders.name, buyerOrgId: forwarders.buyerOrgId }
    })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .innerJoin(
      forwarders,
      and(
        eq(forwarders.buyerOrgId, orders.buyerOrgId),
        sql`${forwarders.id}::text = ${orders.data}->'via'->>'forwarderId'`
      )
    )
    .where(and(eq(forwarders.forwarderOrgId, s.org.id), isNull(forwarders.removedAt), ne(orders.status, "draft"), only))
    .orderBy(orders.createdAt)
}

export async function forwarderOrders(s: Session, executor: Transaction | ReturnType<typeof db> = db()) {
  return s.org.kind === "forwarder" ? forwarderRows(s, executor) : []
}

export async function forwarderOrder(s: Session, id: string, executor: Transaction | ReturnType<typeof db> = db()) {
  // A malformed id, such as /orders/abc, finds nothing, like an unknown one.
  const [row] =
    s.org.kind === "forwarder" && z.uuid().safeParse(id).success
      ? await forwarderRows(s, executor, eq(orders.id, id))
      : []
  if (!row) {
    throw new NotFoundError()
  }
  return row
}
