import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { saveCatalog } from "@/server/catalogs"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { isAppOrigin } from "@/server/security"

// Creates or saves a catalog from its form.
export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  try {
    const s = await session()
    requireAccess(s, "catalogs", "edit")
    requireAccess(s, "prices")
    return Response.json(await saveCatalog(s, await request.json()))
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "catalogSaveFailed") }, { status: failureStatus(error) })
  }
}
