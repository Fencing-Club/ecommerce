import { ZodError } from "zod"
import { session } from "@/server/auth"
import { LocationSettingsError, readLocationMappings, saveLocationMapping } from "@/server/inventory-location-settings"

const headers = { "Cache-Control": "private, no-store" }
function failure(error: unknown) {
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
    return Response.json(await saveLocationMapping(s, await request.json()), { headers })
  } catch (error) {
    return failure(error)
  }
}
