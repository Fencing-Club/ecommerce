import { requireAccess, session } from "@/server/auth"
import { failureStatus } from "@/server/errors"
import { saveImportedOrder } from "@/server/import-save"
import { appUrl } from "@/server/security"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  const s = await session()
  try {
    requireAccess(s, "orders", "edit")
    const { id } = await params
    const order = await saveImportedOrder(s, id, await request.json())
    return Response.json({ id: order.id, redirect: `/orders/${order.id}` })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Import could not be saved" },
      { status: failureStatus(error) }
    )
  }
}
