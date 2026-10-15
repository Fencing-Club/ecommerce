import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { orderWorkflow } from "@/server/workflow"

export const GET = withRequest(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const s = await session()
  requirePage(s, "orders")
  // It carries invoice prices and the purchase order's download links.
  requirePage(s, "prices")
  const id = z.uuid().parse((await context.params).id)
  return Response.json(await orderWorkflow(s, id), { headers: { "Cache-Control": "private, no-store" } })
})
