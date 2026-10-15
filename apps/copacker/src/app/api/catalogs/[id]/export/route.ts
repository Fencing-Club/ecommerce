import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { priceList } from "@/server/catalog-export"
import { errorTextResponse } from "@/server/errors"
import { priceListPdf, priceListWorkbook } from "@/server/price-list-files"

// A catalog's price list to send its customers, as an Excel workbook or a PDF.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  const id = z.uuid().safeParse((await params).id)
  if (s.org.kind !== "supplier" || !id.success) {
    return errorTextResponse("catalogNotFound", 404)
  }
  requirePage(s, "catalogs")
  requirePage(s, "prices")
  const list = await priceList(s.org.id, s.org.name, id.data)
  if (!list) {
    return errorTextResponse("catalogNotFound", 404)
  }
  const pdf = new URL(request.url).searchParams.get("format") === "pdf"
  const name = `${list.title.replace(/[^\w -]+/g, "").trim() || "catalog"} price list`
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  return pdf
    ? new Response(new Uint8Array(await priceListPdf(list)), {
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${name}.pdf"`
        }
      })
    : new Response(new Uint8Array(await priceListWorkbook(list)), {
        headers: {
          ...headers,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${name}.xlsx"`
        }
      })
}
