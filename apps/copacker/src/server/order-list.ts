import type { OrderInput } from "@repo/aisle"
import { money, orderTotal } from "@repo/aisle"
import { orderNetworks } from "@repo/aisle/requirements"
import { inArray } from "drizzle-orm"
import type { OrderListRow } from "@/components/order-list"
import { db } from "@/db"
import { contacts } from "@/db/schema"
import type { visibleOrders } from "@/server/access"
import { localization } from "@/server/localization"
import { requirementTranslator } from "@/server/requirements"

async function destinations(list: OrderInput[]) {
  const addressIds = [
    ...new Set(list.flatMap((data) => (data.destination !== "amazon" && data.deliveryId ? [data.deliveryId] : [])))
  ]
  const text = await requirementTranslator()
  const addresses = addressIds.length
    ? await db().select({ id: contacts.id, name: contacts.name }).from(contacts).where(inArray(contacts.id, addressIds))
    : []
  return (data: OrderInput) =>
    data.destination === "amazon"
      ? text.amazon(orderNetworks(data))
      : (addresses.find((row) => row.id === data.deliveryId)?.name ?? "—")
}

export async function orderListRows(
  rows: Array<{
    order: Pick<Awaited<ReturnType<typeof visibleOrders>>[number]["order"], "id" | "data" | "status" | "createdAt">
    supplier: { name: string }
  }>,
  prices: boolean
): Promise<OrderListRow[]> {
  const destination = await destinations(rows.map((row) => row.order.data))
  const { locale } = await localization()
  return rows.map(({ order, supplier }) => ({
    order: { id: order.id, status: order.status, createdAt: order.createdAt },
    supplier: { name: supplier.name },
    reference: order.data.reference,
    lineCount: order.data.items.length,
    destination: destination(order.data),
    value: prices ? money(orderTotal(order.data), order.data.currency, locale) : null
  }))
}
