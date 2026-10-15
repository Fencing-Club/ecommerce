import { ZodError } from "zod"
import { AccessError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { requireAdmin } from "@/server/authorization"
import { errorResponse, failureMessage } from "@/server/errors"
import { LocationSettingsError, readLocationMappings, saveLocationMapping } from "@/server/inventory-location-settings"

const headers = { "Cache-Control": "private, no-store" }
async function failure(error: unknown) {
  if (error instanceof AccessError) {
    return Response.json({ error: await failureMessage(error) }, { status: 403, headers })
  }
  if (error instanceof LocationSettingsError) {
    return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return errorResponse("invalidLocationSettings", 400, headers)
  }
  return errorResponse("locationSettingsUnavailable", 500, headers)
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
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  try {
    // Which locations count is one of the store's settings.
    requireAdmin(s)
    return Response.json(await saveLocationMapping(s, await request.json()), { headers })
  } catch (error) {
    return failure(error)
  }
}
