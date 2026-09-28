import { z } from "zod"
import { session } from "@/server/auth"
import { assignCatalog } from "@/server/catalogs"
import { appUrl } from "@/server/security"

const input = z.strictObject({ catalogId: z.uuid().nullable() })

// Gives a customer a catalog, or takes it away so the customer sees every active product at its own price.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const { catalogId } = input.parse(await request.json())
    await assignCatalog(await session(), z.uuid().parse((await params).id), catalogId)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save" }, { status: 400 })
  }
}
