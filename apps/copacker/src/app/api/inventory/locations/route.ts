import { ZodError } from "zod"
import { requireAdmin, session } from "@/server/auth"
import { AccessError } from "@/server/errors"
import { LocationSettingsError, readLocationMappings, saveLocationMapping } from "@/server/inventory-location-settings"

const headers = { "Cache-Control": "private, no-store" }
function failure(error: unknown) {
  if (error instanceof AccessError) {
    return Response.json({ error: error.message }, { status: 403, headers })
  }
  if (error instanceof LocationSettingsError) {
    return Response.json({ error: error.message }, { status: error.status, headers })
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return Response.json({ error: "Invalid inventory location settings" }, { status: 400, headers })
  }
  return Response.json({ error: "Inventory location settings are unavailable. Try again." }, { status: 500, headers })
}
export async function GET() {
  const s = await session()
  try {
    return Response.json(await readLocationMappings(s), { headers })
  } catch (error) {
    return failure(error)
  }
}
export async function PATCH(request: Request) {
  const s = await session()
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  try {
    // Which locations count is one of the store's settings.
    requireAdmin(s)
    return Response.json(await saveLocationMapping(s, await request.json()), { headers })
  } catch (error) {
    return failure(error)
  }
}
