import { session } from "@/server/auth"
import { productsWithoutSupplier } from "@/server/product-suppliers"

// Products with no known supplier, for the warning on the Products page.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const s = await session()
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  return Response.json(await productsWithoutSupplier(s.org.id), { headers })
}
