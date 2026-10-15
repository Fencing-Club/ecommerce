import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { deleteCatalog } from "@/server/catalogs"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { isAppOrigin } from "@/server/security"

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  try {
    const s = await session()
    requireAccess(s, "catalogs", "edit")
    requireAccess(s, "prices")
    await deleteCatalog(s, z.uuid().parse((await params).id))
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json(
      { error: await failureMessage(error, "catalogDeleteFailed") },
      { status: failureStatus(error) }
    )
  }
}
