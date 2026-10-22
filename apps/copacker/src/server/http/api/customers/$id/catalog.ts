import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { assignCatalog } from "@/server/catalogs"
import { requestInput, requestJson } from "@/server/errors"

const input = z.strictObject({ catalogId: z.uuid().nullable() })

// Gives a customer a catalog, or takes it away so the customer sees every active product at its own price.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { catalogId } = requestInput(input, await requestJson(request))
  const s = await session()
  requireAccess(s, "customers", "edit")
  await assignCatalog(s, requestInput(z.uuid(), params.id), catalogId)
  return Response.json({ ok: true })
}
