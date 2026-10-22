import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { productsWithoutSupplier } from "@/server/product-suppliers"

// Products with no known supplier, for the warning on the Products page.
export async function GET() {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "products")
  return Response.json(await productsWithoutSupplier(s.org.id))
}
