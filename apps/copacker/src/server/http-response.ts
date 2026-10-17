import { isNotFound, isRedirect } from "@tanstack/react-router"
import { AccessError, NotFoundError } from "@/i18n/errors"
import { errorResponse, failureMessage } from "./errors"

// Domain handlers return standard Fetch responses. This boundary owns their HTTP errors and private-cache policy.
export async function httpResponse(run: () => Response | Promise<Response>) {
  try {
    const response = await run()
    const headers = new Headers(response.headers)
    headers.set("Cache-Control", "private, no-store")
    headers.set("X-Content-Type-Options", "nosniff")
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  } catch (error) {
    if (isRedirect(error)) {
      throw error
    }
    if (error instanceof AccessError) {
      return Response.json(
        { error: await failureMessage(error) },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      )
    }
    if (error instanceof NotFoundError || isNotFound(error)) {
      return errorResponse("notFound", 404, { "Cache-Control": "no-store" })
    }
    throw error
  }
}
