import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { failureMessage, failureStatus } from "@/server/errors"
import { saveImportedOrder } from "@/server/import-save"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const s = await session()
  try {
    requireAccess(s, "orders", "edit")
    const { id } = params
    const order = await saveImportedOrder(s, id, await request.json())
    return Response.json({ id: order.id, redirect: `/orders/${order.id}` })
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "importNotSaved") }, { status: failureStatus(error) })
  }
}
