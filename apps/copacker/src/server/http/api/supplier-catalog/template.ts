import { session } from "@/server/auth"
import { fileResponse } from "@/server/http-response"
import { sheetCsv, sheetWorkbook } from "@/server/product-sheet"

// The blank product template, as an Excel workbook with instructions, or as CSV.
export async function GET(request: Request) {
  const s = await session()
  return new URL(request.url).searchParams.get("format") === "csv"
    ? fileResponse(sheetCsv([]), { filename: "product-template.csv", contentType: "text/csv; charset=utf-8" })
    : fileResponse(new Uint8Array(await sheetWorkbook([], s.org.name)), {
        filename: "product-template.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
}
