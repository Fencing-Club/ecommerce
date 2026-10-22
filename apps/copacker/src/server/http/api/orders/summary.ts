import { destinationSchema } from "@repo/copacker-orders"
import { orderDestination, groupReceivers } from "@repo/copacker-shipments"
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { orders, shipments, suppliers } from "@/db/schema"
import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { errorResponse } from "@/server/errors"
import { orderCoverage } from "@/server/readiness"

const querySchema = z.strictObject({
  supplierId: z.uuid().optional(),
  destination: destinationSchema.optional(),
  cursor: z.uuid().optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d?$/)
    .transform(Number)
    .pipe(z.number().max(50))
    .default(20)
})

export async function GET(request: Request) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders")
  const search = new URL(request.url).searchParams
  const parsed = querySchema.safeParse(Object.fromEntries(search))
  if (!parsed.success || [...search.keys()].some((key) => search.getAll(key).length !== 1)) {
    return errorResponse("invalidCoverageFilters", 400)
  }
  const { supplierId, destination, cursor, limit } = parsed.data
  const result = await db().transaction(
    async (tx) => {
      const page = await tx
        .select({ order: orders, supplierName: suppliers.name })
        .from(orders)
        .innerJoin(suppliers, and(eq(suppliers.id, orders.supplierId), eq(suppliers.buyerOrgId, s.org.id)))
        .where(
          and(
            eq(orders.buyerOrgId, s.org.id),
            eq(orders.status, "submitted"),
            supplierId ? eq(orders.supplierId, supplierId) : undefined,
            // A PO's lines share one group of receivers, so its first line's receiver says where it goes.
            destination
              ? inArray(sql`${orders.data}->'items'->0->>'receiver'`, groupReceivers(destination))
              : undefined,
            cursor ? gt(orders.id, cursor) : undefined
          )
        )
        .orderBy(asc(orders.id))
        .limit(limit + 1)
      const visible = page.slice(0, limit)
      const rows = visible.length
        ? await tx
            .select({ shipment: shipments })
            .from(shipments)
            .innerJoin(orders, eq(orders.id, shipments.orderId))
            .where(
              and(
                eq(orders.buyerOrgId, s.org.id),
                inArray(
                  orders.id,
                  visible.map(({ order }) => order.id)
                )
              )
            )
        : []
      return {
        orders: visible.map(({ order, supplierName }) => {
          const coverage = orderCoverage(
            order.data,
            rows.filter(({ shipment }) => shipment.orderId === order.id).map(({ shipment }) => shipment)
          )
          return {
            id: order.id,
            reference: order.data.reference,
            revision: order.revision,
            destination: orderDestination(order.data),
            forwarderId: order.data.via?.forwarderId ?? null,
            supplier: { id: order.supplierId, name: supplierName },
            shopifyDomain: order.shopifyDomain,
            amazonSellerId: order.amazonSellerId,
            items: coverage.map((item, index) => ({
              ...item,
              variantId: order.data.items[index]!.variantId,
              supplierSku: order.data.items[index]!.supplierSku,
              asin: order.data.items[index]!.asin,
              fnsku: order.data.items[index]!.fnsku,
              piecesPerSet: order.data.items[index]!.piecesPerSet
            }))
          }
        }),
        nextCursor: page.length > limit ? visible.at(-1)!.order.id : null
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
  return Response.json(result)
}
