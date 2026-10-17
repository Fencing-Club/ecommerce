import { and, eq, gte, lt, desc } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { amazonFulfillmentShipments } from "@/db/schema"
import { amazonFulfillmentShipmentsStatus } from "@/server/amazon-fulfillment-shipments"
import { analyticsPagination } from "@/server/analytics-contract"
import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
import { analyticsSnapshot } from "@/server/analytics-snapshot"
const query = z
  .object({
    ...analyticsPagination,
    externalAccountId: z.string().min(1).max(200),
    from: z.iso.date(),
    to: z.iso.date()
  })
  .refine(
    (v) => Date.parse(v.to) > Date.parse(v.from) && Date.parse(v.to) - Date.parse(v.from) <= 31 * 86400000,
    "Choose an increasing window of at most 31 days"
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
          JSON.stringify(["fulfillment-shipments", input.externalAccountId, input.from, input.to])
        )
        const rows = await tx
          .select()
          .from(amazonFulfillmentShipments)
          .where(
            and(
              eq(amazonFulfillmentShipments.orgId, s.org.id),
              eq(amazonFulfillmentShipments.externalAccountId, input.externalAccountId),
              gte(amazonFulfillmentShipments.shippedAt, new Date(input.from)),
              lt(amazonFulfillmentShipments.shippedAt, new Date(input.to))
            )
          )
          .orderBy(
            desc(amazonFulfillmentShipments.shippedAt),
            amazonFulfillmentShipments.shipmentId,
            amazonFulfillmentShipments.shipmentItemId
          )
          .limit(101)
          .offset(input.page * 100)
        const coverage = await amazonFulfillmentShipmentsStatus(s.org.id, input.externalAccountId, new Date(), tx)
        return { shipments: rows.slice(0, 100), page: input.page, hasMore: rows.length > 100, snapshot, coverage }
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    )
    return Response.json(result, { headers: analyticsHeaders })
  })
}
