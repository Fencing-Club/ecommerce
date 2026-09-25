import { and, eq, isNull, ne } from "drizzle-orm"
import { notFound } from "next/navigation"
import { db, type Transaction } from "@/db"
import { orders, suppliers } from "@/db/schema"
import type { Session } from "./auth"

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
