import { z } from "zod"
import { AccessError } from "@/i18n/errors"
import { can } from "@/lib/access"
import { AnalyticsProblem } from "./analytics-contract"
import { session } from "./auth"
import { requireBuyer } from "./authorization"
import { ApiSessionError } from "./errors"
import { describeError } from "./log"
import type { Session } from "./workspace-session"

const titles = new Map([
  [400, "Bad Request"],
  [401, "Unauthorized"],
  [403, "Forbidden"],
  [404, "Not Found"],
  [409, "Conflict"],
  [415, "Unsupported Media Type"],
  [422, "Unprocessable Content"],
  [500, "Internal Server Error"]
])

function problemResponse(request: Request, problem: AnalyticsProblem) {
  return Response.json(
    {
      type: "about:blank",
      title: titles.get(problem.status) ?? "Request Failed",
      status: problem.status,
      detail: problem.message,
      code: problem.code,
      instance: new URL(request.url).pathname
    },
    {
      status: problem.status,
      headers: {
        "Content-Type": "application/problem+json",
        ...(problem.status === 401 ? { "WWW-Authenticate": 'Session realm="copacker"' } : {})
      }
    }
  )
}

const accessDenied = () => new AnalyticsProblem(403, "access_denied", "You do not have access to this resource.")

// Writes need Products edit, reads Sales; both need a buyer workspace and prices. Request-validation failures answer
// 400 and expected failures their own Problem Details. Anything else is a bug or bad stored or provider data: it is
// logged and answers a generic 500.
export async function analyticsRoute(request: Request, write: boolean, action: (s: Session) => Promise<Response>) {
  try {
    const s = await session("api")
    requireBuyer(s)
    if (!can(s, "prices") || !can(s, write ? "products" : "sales", write ? "edit" : "view")) {
      throw accessDenied()
    }
    return await action(s)
  } catch (error) {
    if (error instanceof AnalyticsProblem) {
      return problemResponse(request, error)
    }
    if (error instanceof ApiSessionError) {
      return problemResponse(
        request,
        new AnalyticsProblem(error.status, "session_required", "Sign in and select an authorized workspace.")
      )
    }
    if (error instanceof AccessError) {
      return problemResponse(request, accessDenied())
    }
    console.error(
      JSON.stringify({
        event: "analytics_request_failed",
        method: request.method,
        path: new URL(request.url).pathname,
        error: describeError(error)
      })
    )
    return problemResponse(request, new AnalyticsProblem(500, "internal_error", "The request could not be completed."))
  }
}

// A request's query, path or header value read with its schema. Only these failures answer 400; a ZodError from
// anywhere else is unexpected.
export function analyticsInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new AnalyticsProblem(400, "invalid_request", "Check the request fields and date range.")
  }
  return result.data
}

export function analyticsQuery<T extends z.ZodType>(request: Request, schema: T) {
  return analyticsInput(schema, Object.fromEntries(new URL(request.url).searchParams))
}

// The record ID in the path, or the write's Idempotency-Key.
export const analyticsId = (value: string | null) => analyticsInput(z.uuid(), value)

export async function analyticsJson<T extends z.ZodType>(request: Request, schema: T) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new AnalyticsProblem(415, "unsupported_media_type", "Send application/json.")
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new AnalyticsProblem(400, "invalid_json", "Send valid JSON.")
  }
  return analyticsInput(schema, body)
}
