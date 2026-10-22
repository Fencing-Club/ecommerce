import { orderCurrencies } from "@repo/copacker-shipments"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { session } from "@/server/auth"
import { requireAccess, requireBuyer } from "@/server/authorization"
import { customerProducts } from "@/server/catalogs"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { isAppOrigin } from "@/server/security"
import { matchSupplierCatalog } from "@/server/supplier-catalog-match"
import { availableStock } from "@/server/supplier-stock"

const inputSchema = z.object({
  supplierId: z.uuid(),
  currency: z.enum(orderCurrencies),
  // A PO permits 150 lines, and a Shopify bundle can contain up to 25 distinct components.
  supplierSkus: z.array(z.string().trim().max(255)).max(3750)
})

export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  try {
    const s = await session()
    requireBuyer(s)
    // Purchase orders match their lines to the supplier's catalog.
    requireAccess(s, "orders", "edit")
    const input = inputSchema.parse(await request.json())
    const [supplier] = await db()
      .select({ supplierOrgId: suppliers.supplierOrgId, catalogId: suppliers.catalogId })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
    if (!supplier) {
      return errorResponse("supplierNotLinked", 404)
    }
    const skus = [...new Set(input.supplierSkus.filter(Boolean))]
    // Only what the supplier offers this buyer, at its catalog prices.
    const products = await customerProducts(db(), supplier, skus)
    const { supplierOrgId } = supplier
    const available = supplierOrgId
      ? await db().transaction((tx) => availableStock(tx, supplierOrgId, skus))
      : new Map<string, number>()
    return Response.json(
      input.supplierSkus.map((sku) => ({
        sku,
        // Pieces the supplier can still sell; null when the product has no stock limit.
        available: available.get(sku) ?? null,
        ...matchSupplierCatalog(
          {
            supplierOrgId: supplier.supplierOrgId,
            supplierSku: sku,
            currency: input.currency
          },
          products
        )
      }))
    )
  } catch (error) {
    return Response.json(
      { error: await failureMessage(error, "catalogLookupFailed") },
      { status: failureStatus(error) }
    )
  }
}
