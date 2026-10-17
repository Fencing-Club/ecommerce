import { and, eq, desc, gte, lt } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { salesOrders } from "@/db/schema"
import { analyticsPagination } from "@/server/analytics-contract"
import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
import { analyticsSnapshot } from "@/server/analytics-snapshot"
const query = z
  .object({
    ...analyticsPagination,
    source: z.enum(["amazon", "shopify"]),
    externalAccountId: z.string().min(1).max(200),
    from: z.iso.date(),
    to: z.iso.date()
  })
  .refine(
    (value) =>
      Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000,
    "Choose a window of at most 31 days"
  )
export async function GET(request: Request) {
  return analyticsRoute(request, false, async (s) => {
    const input = query.parse(Object.fromEntries(new URL(request.url).searchParams))
    const result = await db().transaction(
      async (tx) => {
        const snapshot = await analyticsSnapshot(
          tx,
          s.org.id,
          input,
          JSON.stringify(["sales-orders", input.source, input.externalAccountId, input.from, input.to])
        )
        const rows = await tx
          .select()
          .from(salesOrders)
          .where(
            and(
              eq(salesOrders.orgId, s.org.id),
              eq(salesOrders.source, input.source),
              eq(salesOrders.externalAccountId, input.externalAccountId),
              gte(salesOrders.orderedAt, new Date(input.from)),
              lt(salesOrders.orderedAt, new Date(input.to))
            )
          )
          .orderBy(desc(salesOrders.orderedAt), salesOrders.id)
          .limit(101)
          .offset(input.page * 100)
        return {
          orders: rows.slice(0, 100),
          hasMore: rows.length > 100,
          page: input.page,
          snapshot,
          basis: "orders_created_in_window",
          notes: [
            "Stored orders are not proof of complete shipment coverage.",
            "Shipment dates, physical-piece conversion and opening inventory require evidence before importing depletion."
          ]
        }
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    )
    return Response.json(result, { headers: analyticsHeaders })
  })
}
