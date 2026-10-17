import { requirePage, session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { sheetCsv, sheetRows, sheetWorkbook } from "@/server/product-sheet"
import { productList } from "@/server/supplier-products"

// Every product and variant in the product template, as CSV or an Excel workbook, to edit and import again.
export async function GET(request: Request) {
  const s = await session()
  if (s.org.kind !== "supplier") {
    return errorResponse("supplierWorkspaceRequired", 403)
  }
  requirePage(s, "products")
  // The sheet has every price.
  requirePage(s, "prices")
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx"
  const rows = sheetRows(
    (await productList(s.org.id)).map((product) => ({ ...product, active: product.status === "active" }))
  )
  const day = new Date().toISOString().slice(0, 10)
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  if (format === "csv") {
    return new Response(sheetCsv(rows), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products-${day}.csv"`
      }
    })
  }
  return new Response(new Uint8Array(await sheetWorkbook(rows, s.org.name)), {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="products-${day}.xlsx"`
    }
  })
}
