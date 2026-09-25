import { session } from "@/server/auth"
import { catalogTemplate } from "@/server/supplier-catalog-csv"

export async function GET() {
  await session()
  return new Response(catalogTemplate, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="supplier-catalog-template.csv"',
      "Cache-Control": "no-store"
    }
  })
}
