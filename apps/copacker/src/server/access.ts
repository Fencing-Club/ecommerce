import { and, eq, inArray, isNull, ne } from "drizzle-orm"
import { notFound } from "next/navigation"
import { db, type Transaction } from "@/db"
import { forwarders, orders, suppliers } from "@/db/schema"
import type { Session } from "./auth"
import { forwarderLeg } from "./shipment-legs"

export async function accessibleOrder(
  s: Session,
  id: string,
  executor: Transaction | ReturnType<typeof db> = db(),
  lock = false
) {
  const query = executor
    .select({ order: orders, supplier: suppliers })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(
      and(
        eq(orders.id, id),
        s.org.kind === "buyer"
          ? eq(orders.buyerOrgId, s.org.id)
          : and(eq(suppliers.supplierOrgId, s.org.id), isNull(suppliers.removedAt), ne(orders.status, "draft"))
      )
    )
  const [row] = lock ? await query.for("update", { of: orders }) : await query
  if (!row) {
    notFound()
  }
  return row
}
export async function visibleOrders(s: Session) {
  return db()
    .select({ order: orders, supplier: suppliers })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(
      s.org.kind === "buyer"
        ? eq(orders.buyerOrgId, s.org.id)
        : and(eq(suppliers.supplierOrgId, s.org.id), isNull(suppliers.removedAt), ne(orders.status, "draft"))
    )
    .orderBy(orders.createdAt)
}

// The POs a forwarder's workspace handles: sent ones whose goods pass through a forwarder the workspace joined as.
// Forwarders only read these and move shipments on; they never reach accessibleOrder, whose actions assume a supplier.
export async function forwarderOrders(s: Session) {
  if (s.org.kind !== "forwarder") {
    return []
  }
  const joined = await db()
    .select({ id: forwarders.id, name: forwarders.name, buyerOrgId: forwarders.buyerOrgId })
    .from(forwarders)
    .where(and(eq(forwarders.forwarderOrgId, s.org.id), isNull(forwarders.removedAt)))
  if (!joined.length) {
    return []
  }
  const rows = await db()
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

export async function forwarderOrder(s: Session, id: string) {
  const row = (await forwarderOrders(s)).find((candidate) => candidate.order.id === id)
  if (!row) {
    notFound()
  }
  return row
}
