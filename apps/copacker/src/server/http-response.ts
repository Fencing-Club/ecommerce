import { isNotFound, isRedirect } from "@tanstack/react-router"
import type { CsrfMiddlewareOptions } from "@tanstack/react-start"
import { z } from "zod"
import { AccessError, NotFoundError, type ErrorKey } from "@/i18n/errors"
import { errorResponse, failureMessage, StatusError } from "./errors"
import { isAppOrigin } from "./security"

const isMissing = (error: unknown) => error instanceof NotFoundError || isNotFound(error)

// The status httpResponse answers a failure with, or null for an unexpected one, which goes on to Start.
function mappedStatus(error: unknown) {
  if (isMissing(error)) {
    return 404
  }
  if (error instanceof AccessError) {
    return 403
  }
  if (error instanceof StatusError) {
    return error.status
  }
  // The request's body, query or path didn't parse.
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return 400
  }
  return null
}

async function failureResponse(error: unknown) {
  const status = mappedStatus(error)
  if (status === null) {
    throw error
  }
  if (isMissing(error)) {
    return errorResponse("notFound", 404)
  }
  return Response.json({ error: await failureMessage(error) }, { status })
}

// Domain handlers return standard Fetch responses. This boundary turns their failures into HTTP errors, and keeps
// responses private unless a handler chose its own cache policy, such as an immutable photo.
export async function httpResponse(run: () => Response | Promise<Response>) {
  let response: Response
  try {
    response = await run()
  } catch (error) {
    if (isRedirect(error)) {
      throw error
    }
    response = await failureResponse(error)
  }
  const headers = new Headers(response.headers)
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, no-store")
  }
  headers.set("X-Content-Type-Options", "nosniff")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

// A route's answer to a failure httpResponse doesn't know, such as a provider being down: the route's own message, 500
// unless it says otherwise. The failures httpResponse does know go on to it.
export async function fallbackResponse(error: unknown, key: ErrorKey, status = 500) {
  if (isRedirect(error) || mappedStatus(error) !== null) {
    throw error
  }
  return errorResponse(key, status)
}

type Download = { filename: string; contentType: string; disposition?: "attachment" | "inline" }

// RFC 5987: encodeURIComponent leaves ' ( ) * as they are, which a filename* value can't hold.
function encodedFilename(filename: string) {
  return encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

// A private file: the browser saves it under its name, or shows it with "inline", and never sniffs, runs or keeps it.
export function fileResponse(body: BodyInit, { filename, contentType, disposition = "attachment" }: Download) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedFilename(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox"
    }
  })
}

// Requests other sites send on purpose, each proven another way: a provider's webhook by its signature, and a mail
// app's one-click unsubscribe (RFC 8058) by its link's.
const crossSite = [/^\/api\/webhooks\//, /^\/api\/mailing-list\/unsubscribe$/]

type OriginCheck = { request: Request; pathname: string; handlerType: "serverFn" | "router" }

// Every server function, and every request that changes something, must come from the app's own pages: the browser
// says so in Sec-Fetch-Site, or else its Origin (or Referer) is one of the app's addresses. src/start.ts applies it
// with Start's CSRF middleware, before any handler runs.
export const appOriginPolicy = {
  filter: ({ request, pathname, handlerType }: OriginCheck) =>
    handlerType === "serverFn" ||
    (!["GET", "HEAD"].includes(request.method) && !crossSite.some((path) => path.test(pathname))),
  origin: (origin: string) => isAppOrigin(origin),
  failureResponse: () => errorResponse("invalidOrigin", 403)
} satisfies CsrfMiddlewareOptions
