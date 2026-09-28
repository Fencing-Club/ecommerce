import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { session } from "@/server/auth"

// The buyer's suppliers and lead times, for the restock supplier filter.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  const rows = await db()
    .select({
      id: suppliers.id,
      name: suppliers.name,
      leadTimeDays: suppliers.leadTimeDays
    })
    .from(suppliers)
    .where(and(eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
    .orderBy(suppliers.name)
  return Response.json(rows, { headers })
}
