import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { orderWorkflow } from "@/server/workflow"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const s = await session()
  requirePage(s, "orders")
  const id = z.uuid().parse((await context.params).id)
  return Response.json(await orderWorkflow(s, id), { headers: { "Cache-Control": "private, no-store" } })
}
