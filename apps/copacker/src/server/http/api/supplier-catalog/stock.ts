import { session } from "@/server/auth"
import { requestJson } from "@/server/errors"
import { saveSupplierCounts } from "@/server/supplier-counts"

export async function POST(request: Request) {
  const rows = await saveSupplierCounts(await session(), await requestJson(request))
  return Response.json({ saved: rows.length })
}
