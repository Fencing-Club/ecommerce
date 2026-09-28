import { z } from "zod"
import { requireAccess, session } from "@/server/auth"
import { deleteCatalog } from "@/server/catalogs"
import { failureStatus } from "@/server/errors"
import { appUrl } from "@/server/security"

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    requireAccess(s, "catalogs", "edit")
    await deleteCatalog(s, z.uuid().parse((await params).id))
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete catalog" },
      { status: failureStatus(error) }
    )
  }
}
