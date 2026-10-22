import { AccessError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { failureMessage } from "@/server/errors"
import { saveProduct } from "@/server/supplier-products"

// Creates or saves a product and its variants from the product page.
export async function POST(request: Request) {
  try {
    const s = await session()
    requireAccess(s, "products", "edit")
    // A product's variants carry its prices.
    requireAccess(s, "prices")
    return Response.json(await saveProduct(s, await request.json()))
  } catch (error) {
    const message = await failureMessage(error, "productNotSaved")
    if (error instanceof AccessError) {
      return Response.json({ error: message }, { status: 403 })
    }
    // A product or variant someone else changed; the English message says so in every language.
    return Response.json(
      { error: message },
      { status: error instanceof Error && error.message.includes("changed") ? 409 : 400 }
    )
  }
}
