import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { saveImportedOrder } from "@/server/import-save"
import { withRequest } from "@/server/next-request"
import { isAppOrigin } from "@/server/security"

export const POST = withRequest(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  const s = await session()
  try {
    requireAccess(s, "orders", "edit")
    const { id } = await params
    const order = await saveImportedOrder(s, id, await request.json())
    return Response.json({ id: order.id, redirect: `/orders/${order.id}` })
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "importNotSaved") }, { status: failureStatus(error) })
  }
})
