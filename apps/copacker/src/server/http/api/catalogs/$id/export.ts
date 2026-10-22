import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { requireSupplier } from "@/server/authorization"
import { priceList } from "@/server/catalog-export"
import { errorTextResponse } from "@/server/errors"
import { fileResponse } from "@/server/http-response"
import { priceListPdf, priceListWorkbook } from "@/server/price-list-files"

// A catalog's price list to send its customers, as an Excel workbook or a PDF.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const s = await session()
  requireSupplier(s)
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) {
    return errorTextResponse("catalogNotFound", 404)
  }
  requirePage(s, "catalogs")
  requirePage(s, "prices")
  const list = await priceList(s.org.id, s.org.name, id.data)
  if (!list) {
    return errorTextResponse("catalogNotFound", 404)
  }
  const name = `${list.title.replace(/[^\w -]+/g, "").trim() || "catalog"} price list`
  return new URL(request.url).searchParams.get("format") === "pdf"
    ? fileResponse(new Uint8Array(await priceListPdf(list)), {
        filename: `${name}.pdf`,
        contentType: "application/pdf"
      })
    : fileResponse(new Uint8Array(await priceListWorkbook(list)), {
        filename: `${name}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
}
