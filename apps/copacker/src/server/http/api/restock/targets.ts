import { targetRestockSelectionSchema } from "@repo/copacker-contract"
import { requirePage, session } from "@/server/auth"
import { requestInput, requestJson } from "@/server/errors"
import { restockTargetReport } from "@/server/restock-page"

export async function POST(request: Request) {
  const s = await session()
  requirePage(s, "restock")
  const input = requestInput(targetRestockSelectionSchema, await requestJson(request))
  return Response.json(await restockTargetReport(s, input))
}
