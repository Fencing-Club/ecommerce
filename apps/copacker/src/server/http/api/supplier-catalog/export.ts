import { requirePage, session } from "@/server/auth"
import { requireSupplier } from "@/server/authorization"
import { fileResponse } from "@/server/http-response"
import { sheetCsv, sheetRows, sheetWorkbook } from "@/server/product-sheet"
import { productList } from "@/server/supplier-products"

// Every product and variant in the product template, as CSV or an Excel workbook, to edit and import again.
export async function GET(request: Request) {
  const s = await session()
  requireSupplier(s)
  requirePage(s, "products")
  // The sheet has every price.
  requirePage(s, "prices")
  const rows = sheetRows(
    (await productList(s.org.id)).map((product) => ({ ...product, active: product.status === "active" }))
  )
  const day = new Date().toISOString().slice(0, 10)
  return new URL(request.url).searchParams.get("format") === "csv"
    ? fileResponse(sheetCsv(rows), { filename: `products-${day}.csv`, contentType: "text/csv; charset=utf-8" })
    : fileResponse(new Uint8Array(await sheetWorkbook(rows, s.org.name)), {
        filename: `products-${day}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
}
