import { session } from "@/server/auth"
import { saveCatalog } from "@/server/catalogs"
import { appUrl } from "@/server/security"

// Creates or saves a catalog from its form.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    return Response.json(await saveCatalog(await session(), await request.json()))
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save catalog" }, { status: 400 })
  }
}
