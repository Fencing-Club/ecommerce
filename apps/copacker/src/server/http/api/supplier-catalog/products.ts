import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { requestJson } from "@/server/errors"
import { saveProduct } from "@/server/supplier-products"

// Creates or saves a product and its variants from the product page. A product's variants carry its prices, which a
// supplier's Products: Edit includes.
export async function POST(request: Request) {
  const s = await session()
  requireAccess(s, "products", "edit")
  return Response.json(await saveProduct(s, await requestJson(request)))
}
