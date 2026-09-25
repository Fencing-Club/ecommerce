import { and, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts, suppliers } from "@/db/schema"
import { requireBuyer, session } from "@/server/auth"
import { appUrl } from "@/server/security"
import { matchSupplierCatalog } from "@/server/supplier-catalog-match"

const inputSchema = z.object({
  supplierId: z.uuid(),
  currency: z.enum(["USD", "CNY", "EUR", "GBP", "CAD", "AUD"]),
  supplierSkus: z.array(z.string().trim().max(255)).max(100)
})

export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    requireBuyer(s)
    const input = inputSchema.parse(await request.json())
    const [supplier] = await db()
      .select({ supplierOrgId: suppliers.supplierOrgId })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
    if (!supplier) {
      return Response.json({ error: "Supplier is not linked to this workspace" }, { status: 404 })
    }
    const skus = [...new Set(input.supplierSkus.filter(Boolean))]
    const catalog =
      supplier.supplierOrgId && skus.length
        ? await db()
            .select()
            .from(supplierProducts)
            .where(
              and(
                eq(supplierProducts.supplierOrgId, supplier.supplierOrgId),
                inArray(supplierProducts.supplierSku, skus)
              )
            )
        : []
    const products = catalog.map((product) => ({ ...product, active: product.active === 1 }))
    return Response.json(
      input.supplierSkus.map((sku) => ({
        sku,
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
    return Response.json({ error: error instanceof Error ? error.message : "Catalog lookup failed" }, { status: 400 })
  }
}
