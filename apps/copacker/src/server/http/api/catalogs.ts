import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { saveCatalog } from "@/server/catalogs"
import { failureMessage, failureStatus } from "@/server/errors"

// Creates or saves a catalog from its form.
export async function POST(request: Request) {
  try {
    const s = await session()
    requireAccess(s, "catalogs", "edit")
    requireAccess(s, "prices")
    return Response.json(await saveCatalog(s, await request.json()))
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "catalogSaveFailed") }, { status: failureStatus(error) })
  }
}
