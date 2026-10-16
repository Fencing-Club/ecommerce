import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { productsWithoutSupplier } from "@/server/product-suppliers"

// Products with no known supplier, for the warning on the Products page.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  requirePage(s, "products")
  return Response.json(await productsWithoutSupplier(s.org.id), { headers })
}
