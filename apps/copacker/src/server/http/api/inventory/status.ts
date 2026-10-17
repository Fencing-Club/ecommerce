import { and, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { connections, stockSnapshots } from "@/db/schema"
import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { stockScopes, stockSelection } from "@/server/stock"

// Status polling must not transfer the catalog JSON from Postgres on every request.
export async function GET(request: Request) {
  const s = await session()
  const headers = { "Cache-Control": "private, no-store" }
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  requirePage(s, "products")
  const search = new URL(request.url).searchParams
  const selection = stockSelection.safeParse(Object.fromEntries(search))
  if (!selection.success || [...search.keys()].some((key) => search.getAll(key).length !== 1)) {
    return errorResponse("invalidStockQuery", 400, headers)
  }
  const { source } = selection.data
  const { provider, scopeKey } = stockScopes[source]
  const [current] = await db()
    .select({
      externalAccountId: connections.externalId,
      observedAt: sql<string | null>`${stockSnapshots.data}->>'observedAt'`,
      status: stockSnapshots.status,
      errorCode: stockSnapshots.errorCode
    })
    .from(connections)
    .leftJoin(
      stockSnapshots,
      and(
        eq(stockSnapshots.orgId, connections.orgId),
        eq(stockSnapshots.externalAccountId, connections.externalId),
        eq(stockSnapshots.source, source),
        eq(stockSnapshots.scopeKey, scopeKey)
      )
    )
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, provider)))
  return Response.json(
    {
      externalAccountId: current?.externalAccountId ?? null,
      observedAt: current?.observedAt ?? null,
      refresh: {
        status: current?.status ?? "idle",
        errorCode: current ? (current.errorCode ?? null) : "not_connected"
      }
    },
    { headers }
  )
}
