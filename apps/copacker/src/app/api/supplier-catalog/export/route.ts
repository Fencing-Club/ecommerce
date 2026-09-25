import { and, asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { session } from "@/server/auth"
import { exportSupplierCatalogCsv } from "@/server/supplier-catalog-csv"

export async function GET() {
  const s = await session()
  if (s.org.kind !== "supplier") {
    return Response.json({ error: "A supplier workspace is required" }, { status: 403 })
  }
  const rows = await db()
    .select()
    .from(supplierProducts)
    .where(and(eq(supplierProducts.supplierOrgId, s.org.id), eq(supplierProducts.active, 1)))
    .orderBy(asc(supplierProducts.supplierSku))
  if (rows.length > 5000) {
    return Response.json(
      { error: "Catalog exceeds 5,000 active products. Contact support for a bulk export." },
      { status: 409 }
    )
  }
  const csv = exportSupplierCatalogCsv(rows)
  if (Buffer.byteLength(csv, "utf8") > 2 * 1024 * 1024) {
    return Response.json(
      { error: "Catalog exceeds the 2 MB import limit. Contact support for a bulk export." },
      { status: 409 }
    )
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="supplier-catalog.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  })
}
