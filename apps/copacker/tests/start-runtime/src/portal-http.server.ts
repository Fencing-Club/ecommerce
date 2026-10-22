import { getCookie, setCookie } from "@tanstack/react-start/server"
import { z } from "zod"
import { errorResponse, requestInput } from "@/server/errors"
import { portalSession } from "@/server/portal-session"
import { salesOrderList } from "@/server/sales-order-list"
import { searchIndex } from "@/server/search"
import { appUrl, isAppOrigin } from "@/server/security"
import { requireMembership, workspaceCookie } from "@/server/workspace-session"
import { portalData } from "./portal-data.server"

export function portalHttp(request: Request, operation: "workspace" | "switch" | "search" | "sales", data?: unknown) {
  return portalData(async (user) => {
    if (!user) {
      return errorResponse("forbidden", 401)
    }
    const resolved = await portalSession(user, getCookie(workspaceCookie), "/overview")
    if (resolved.redirect) {
      return errorResponse("forbidden", 403)
    }
    const { session } = resolved
    if (operation === "sales") {
      return salesOrderList(session, new URL(request.url).searchParams)
    }
    if (operation === "workspace") {
      return Response.json({ id: session.org.id })
    }
    if (operation === "search") {
      return Response.json(await searchIndex(session))
    }
    if (!isAppOrigin(request.headers.get("origin"))) {
      return errorResponse("forbidden", 403)
    }
    // Its failures are answered by the action route's httpResponse.
    const { id } = requestInput(z.object({ id: z.uuid() }), data)
    await requireMembership(session.user.id, id)
    setCookie(workspaceCookie, id, {
      httpOnly: true,
      secure: appUrl().startsWith("https:"),
      sameSite: "lax",
      path: "/"
    })
    return Response.json({ redirect: "/" })
  })
}
