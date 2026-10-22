import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { deleteCatalog } from "@/server/catalogs"
import { failureMessage, failureStatus } from "@/server/errors"

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
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
