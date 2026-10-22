import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { assignCatalog } from "@/server/catalogs"
import { failureMessage, failureStatus } from "@/server/errors"

const input = z.strictObject({ catalogId: z.uuid().nullable() })

// Gives a customer a catalog, or takes it away so the customer sees every active product at its own price.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { catalogId } = input.parse(await request.json())
    const s = await session()
    requireAccess(s, "customers", "edit")
    await assignCatalog(s, z.uuid().parse((await params).id), catalogId)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "saveFailedShort") }, { status: failureStatus(error) })
  }
}
