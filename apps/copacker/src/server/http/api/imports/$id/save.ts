import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { requestJson } from "@/server/errors"
import { saveImportedOrder } from "@/server/import-save"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const s = await session()
  requireAccess(s, "orders", "edit")
  const order = await saveImportedOrder(s, params.id, await requestJson(request))
  return Response.json({ id: order.id, redirect: `/orders/${order.id}` })
}
