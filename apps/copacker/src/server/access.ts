import { and, eq, inArray, isNull, ne } from "drizzle-orm"
import { z } from "zod"
import type { Transaction } from "@/db"
import { db } from "@/db"
import { forwarders, orders, suppliers } from "@/db/schema"
import { NotFoundError } from "@/i18n/errors"
import { forwarderLeg } from "./shipment-legs"
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
export async function visibleOrders(s: Session) {
  return db()
    .select({ order: orders, supplier: suppliers })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(orderVisibleTo(s))
    .orderBy(orders.createdAt)
}

// The POs a forwarder's workspace handles: sent ones whose goods pass through a forwarder the workspace joined as.
// Forwarders only read these and move shipments on; they never reach accessibleOrder, whose actions assume a supplier.
export async function forwarderOrders(s: Session, executor: Transaction | ReturnType<typeof db> = db()) {
  if (s.org.kind !== "forwarder") {
    return []
  }
  const joined = await executor
    .select({ id: forwarders.id, name: forwarders.name, buyerOrgId: forwarders.buyerOrgId })
    .from(forwarders)
    .where(and(eq(forwarders.forwarderOrgId, s.org.id), isNull(forwarders.removedAt)))
  if (!joined.length) {
    return []
  }
  const rows = await executor
    .select({ order: orders, supplier: suppliers })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(
      and(
        inArray(
          orders.buyerOrgId,
          joined.map((row) => row.buyerOrgId)
        ),
        ne(orders.status, "draft")
      )
    )
    .orderBy(orders.createdAt)
  return rows.flatMap((row) => {
    const forwarder = joined.find((candidate) => candidate.id === forwarderLeg(row.order.data))
    return forwarder ? [{ ...row, forwarder }] : []
  })
}

export async function forwarderOrder(s: Session, id: string, executor: Transaction | ReturnType<typeof db> = db()) {
  const row = (await forwarderOrders(s, executor)).find((candidate) => candidate.order.id === id)
  if (!row) {
    throw new NotFoundError()
  }
  return row
}
