import { redirect } from "@tanstack/react-router"
import { getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server"
import { AccessError } from "@/i18n/errors"
import type { AccessLevel } from "@/lib/access"
import type { Grant } from "@/lib/access"
import type { Permissions } from "@/lib/access"
import { can } from "@/lib/access"
import { authentication } from "./auth-session"
import { ApiSessionError } from "./errors"
import { appUrl, returnPath } from "./security"
import { workspaceCookie, workspaceRecoveryPath, workspaceSession } from "./workspace-session"

export function setWorkspace(id: string) {
  setCookie(workspaceCookie, id, { httpOnly: true, secure: appUrl().startsWith("https:"), sameSite: "lax", path: "/" })
}
export async function signedInUser() {
  return process.env.WORKOS_CLIENT_ID ? (await authentication()).user : null
}
export async function identity(returnTo?: string) {
  if (!process.env.WORKOS_CLIENT_ID) {
    throw redirect({ href: "/setup" })
  }
  const user = await signedInUser()
  if (!user) {
    const url = getRequestUrl()
    const requested = returnPath(returnTo ?? `${url.pathname}${url.search}`, "/")
    throw redirect({ href: `/login?next=${encodeURIComponent(requested)}` })
  }
  return user
}
// Resolve current membership for each operation; API callers receive errors, never page redirects.
export async function session(mode: "page" | "api" = "page") {
  const user = mode === "api" ? await signedInUser() : await identity()
  if (!user) {
    throw new ApiSessionError(401)
  }
  const active = getCookie(workspaceCookie)
  const current = await workspaceSession(user, active)
  if (!current) {
    if (mode === "api") {
      throw new ApiSessionError(403)
    }
    throw redirect({ href: await workspaceRecoveryPath(user.id, active) })
  }
  return current
}
export function requirePage(s: Permissions, grant: Grant, level: AccessLevel = "view") {
  if (!can(s, grant, level)) {
    throw new AccessError("forbidden")
  }
}
