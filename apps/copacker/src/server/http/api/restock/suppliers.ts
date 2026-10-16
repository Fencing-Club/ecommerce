import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { AccessError } from "@/i18n/errors"
import { can } from "@/lib/access"
import { session } from "@/server/auth"
import { errorResponse } from "@/server/errors"

// The buyer's suppliers and lead times, for the restock supplier filter.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  // The Products page and Restock pick suppliers from it.
  if (!can(s, "products") && !can(s, "restock")) {
    throw new AccessError("forbidden")
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
