import { ZodError } from "zod"
import { session } from "@/server/auth"
import { requireAdmin, requireBuyer } from "@/server/authorization"
import { errorResponse } from "@/server/errors"
import { fallbackResponse } from "@/server/http-response"
import { readLocationMappings, saveLocationMapping } from "@/server/inventory-location-settings"

export async function GET() {
  const s = await session()
  try {
    return Response.json(await readLocationMappings(s))
  } catch (error) {
    return fallbackResponse(error, "locationSettingsUnavailable")
  }
}
export async function PATCH(request: Request) {
  const s = await session()
  requireBuyer(s)
  // Which locations count is one of the store's settings.
  requireAdmin(s)
  try {
    return Response.json(await saveLocationMapping(s, await request.json()))
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse("invalidLocationSettings", 400)
    }
    return fallbackResponse(error, "locationSettingsUnavailable")
  }
}
