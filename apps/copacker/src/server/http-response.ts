import { isNotFound, isRedirect } from "@tanstack/react-router"
import type { CsrfMiddlewareOptions } from "@tanstack/react-start"
import { z } from "zod"
import { AccessError, LocalizedError, NotFoundError, type ErrorKey } from "@/i18n/errors"
import { errorResponse, failureMessage, InvalidRequestError, StatusError } from "./errors"
import { describeError, logEvent } from "./log"
import { isAppOrigin } from "./security"

const isMissing = (error: unknown) => error instanceof NotFoundError || isNotFound(error)

// The status httpResponse answers a failure with, or null for an unexpected one.
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
  // The request's body, query or path didn't parse, or the domain refused it with a message for the person, such as a
  // PO that changed meanwhile.
  if (error instanceof InvalidRequestError || error instanceof LocalizedError) {
    return 400
  }
  return null
}

// Something other than the request didn't parse: stored data, or a provider's answer, no longer fits its schema.
const isParseFailure = (error: unknown) => error instanceof z.ZodError || error instanceof SyntaxError

async function failureResponse(request: Request, error: unknown) {
  const status = mappedStatus(error)
  if (status === null) {
    if (!isParseFailure(error)) {
      throw error
    }
    logEvent("error", "api_request_failed", {
      method: request.method,
      path: new URL(request.url).pathname,
      error: describeError(error)
    })
    return errorResponse("requestFailed", 500)
  }
  if (isMissing(error)) {
    return errorResponse("notFound", 404)
  }
  return Response.json({ error: await failureMessage(error) }, { status })
}

// Domain handlers return standard Fetch responses. This boundary turns their failures into HTTP errors, and keeps
// responses private unless a handler chose its own cache policy, such as an immutable photo. A parse failure that isn't
// the request's is logged and answered 500; any other unexpected failure goes on to Start.
export async function httpResponse(request: Request, run: () => Response | Promise<Response>) {
  let response: Response
  try {
    response = await run()
  } catch (error) {
    if (isRedirect(error)) {
      throw error
    }
    response = await failureResponse(request, error)
  }
  const headers = new Headers(response.headers)
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, no-store")
  }
  headers.set("X-Content-Type-Options", "nosniff")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const
type Method = (typeof methods)[number]
type Handler<P> = (request: Request, context: { params: P }) => Response | Promise<Response>

// A route's server handlers: each HTTP method its handler module exports, answered through httpResponse. A route file
// is `server: { handlers: apiHandlers(handlers) }`, with `import * as handlers` from its module in `server/http`.
export function apiHandlers<P extends Record<string, string>>(module: Partial<Record<Method, Handler<P>>>) {
  const handlers: Partial<Record<Method, (route: { request: Request; params: P }) => Promise<Response>>> = {}
  for (const method of methods) {
    const handler = module[method]
    if (handler) {
      handlers[method] = ({ request, params }) => httpResponse(request, () => handler(request, { params }))
    }
  }
  return handlers
}

// A route's answer to a failure httpResponse doesn't know, such as a provider being down: the route's own message, 500
// unless it says otherwise. The failures httpResponse does know go on to it, and so does a parse failure, which it logs.
export async function fallbackResponse(error: unknown, key: ErrorKey, status = 500) {
  if (isRedirect(error) || mappedStatus(error) !== null || isParseFailure(error)) {
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
const crossSite = [
  /^\/api\/webhooks\//,
  /^\/api\/mailing-list\/unsubscribe$/,
  /^\/api\/cli\/(token|revoke)$/,
  /^\/api\/operations\/[a-z][a-z0-9.-]*$/
]

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
