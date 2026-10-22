import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { deleteCatalog } from "@/server/catalogs"
import { requestInput } from "@/server/errors"

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const s = await session()
  requireAccess(s, "catalogs", "edit")
  await deleteCatalog(s, requestInput(z.uuid(), params.id))
  return Response.json({ ok: true })
}
