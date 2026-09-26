import { session } from "@/server/auth"
import { appUrl } from "@/server/security"
import { SupplierSkuError, saveSupplierSku } from "@/server/supplier-skus"

// Saves a variation's supplier SKU to Shopify.
export async function PATCH(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  try {
    return Response.json(await saveSupplierSku(s, await request.json()), { headers })
  } catch (error) {
    if (error instanceof SupplierSkuError) {
      return Response.json({ error: error.message }, { status: error.status, headers })
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Check the supplier SKU and try again" }, { status: 400, headers })
    }
    return Response.json({ error: "The supplier SKU couldn't be saved. Try again." }, { status: 500, headers })
  }
}
