import { z } from "zod"
import { requirePage, session } from "@/server/auth"
import { requestInput } from "@/server/errors"
import { orderWorkflow } from "@/server/workflow"

export async function GET(_request: Request, context: { params: { id: string } }) {
  const s = await session()
  requirePage(s, "orders")
  // It carries invoice prices and the purchase order's download links.
  requirePage(s, "prices")
  const id = requestInput(z.uuid(), context.params.id)
  return Response.json(await orderWorkflow(s, id))
}
