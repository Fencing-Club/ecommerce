import { z } from "zod"
import { can } from "@/lib/access"
import { AnalyticsProblem } from "./analytics-contract"
import { ApiSessionError, session } from "./auth"
import { isAppOrigin } from "./security"
import type { Session } from "./workspace-session"
export const analyticsHeaders = { "Cache-Control": "private, no-store" }
export async function analyticsRoute(request: Request, write: boolean, action: (s: Session) => Promise<Response>) {
  try {
    if (write && !isAppOrigin(request.headers.get("origin"))) {
      throw new AnalyticsProblem(403, "invalid_origin", "This origin is not allowed.")
    }
    const s = await session("api")
    if (s.org.kind !== "buyer" || !can(s, "prices") || !can(s, write ? "products" : "sales", write ? "edit" : "view")) {
      throw new AnalyticsProblem(403, "access_denied", "You do not have access to this resource.")
    }
    return await action(s)
  } catch (error) {
    let problem = new AnalyticsProblem(500, "internal_error", "The request could not be completed.")
    if (error instanceof AnalyticsProblem) {
      problem = error
    } else if (error instanceof ApiSessionError) {
      problem = new AnalyticsProblem(error.status, "session_required", "Sign in and select an authorized workspace.")
    } else if (error instanceof z.ZodError) {
      problem = new AnalyticsProblem(400, "invalid_request", "Check the request fields and date range.")
    }
    return Response.json(
      {
        type: "about:blank",
        title:
          new Map<number, string>(
            Object.entries({
              400: "Bad Request",
              401: "Unauthorized",
              403: "Forbidden",
              404: "Not Found",
              409: "Conflict",
              415: "Unsupported Media Type",
              422: "Unprocessable Content",
              500: "Internal Server Error"
            }).map(([code, title]) => [Number(code), title])
          ).get(problem.status) ?? "Request Failed",
        status: problem.status,
        detail: problem.message,
        code: problem.code,
        instance: new URL(request.url).pathname
      },
      {
        status: problem.status,
        headers: {
          ...analyticsHeaders,
          "Content-Type": "application/problem+json",
          ...(problem.status === 401 ? { "WWW-Authenticate": 'Session realm="copacker"' } : {})
        }
      }
    )
  }
}
export async function analyticsJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new AnalyticsProblem(415, "unsupported_media_type", "Send application/json.")
  }
  try {
    return await request.json()
  } catch {
    throw new AnalyticsProblem(400, "invalid_json", "Send valid JSON.")
  }
}
