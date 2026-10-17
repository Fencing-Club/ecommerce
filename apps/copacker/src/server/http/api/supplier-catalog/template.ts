import { session } from "@/server/auth"
import { sheetCsv, sheetWorkbook } from "@/server/product-sheet"

// The blank product template, as an Excel workbook with instructions, or as CSV.
export async function GET(request: Request) {
  const s = await session()
  const csv = new URL(request.url).searchParams.get("format") === "csv"
  return csv
    ? new Response(sheetCsv([]), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="product-template.csv"',
          "Cache-Control": "no-store"
        }
      })
    : new Response(new Uint8Array(await sheetWorkbook([], s.org.name)), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="product-template.xlsx"',
          "Cache-Control": "no-store"
        }
      })
}
