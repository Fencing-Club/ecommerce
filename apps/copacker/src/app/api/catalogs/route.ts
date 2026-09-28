import { requireAccess, session } from "@/server/auth"
import { saveCatalog } from "@/server/catalogs"
import { failureStatus } from "@/server/errors"
import { appUrl } from "@/server/security"

// Creates or saves a catalog from its form.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    requireAccess(s, "catalogs", "edit")
    return Response.json(await saveCatalog(s, await request.json()))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save catalog" },
      { status: failureStatus(error) }
    )
  }
}
