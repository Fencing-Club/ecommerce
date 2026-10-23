import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getCookie } from "@tanstack/react-start/server"
import { z } from "zod"
import { identity } from "@/server/auth"
import { portalSession, portalShell } from "@/server/portal-session"
import { workspaceCookie } from "@/server/workspace-session"

// The cookie the kit's SidebarProvider keeps the sidebar's open state in, so the server renders it as it was left.
const sidebarCookie = "sidebar_state"

export const readPortal = createServerFn()
  .validator(z.string().max(4096))
  .handler(async ({ data: requested }) => {
    const result = await portalSession(await identity(requested), getCookie(workspaceCookie), requested)
    if (result.redirect) {
      throw redirect({ href: result.redirect })
    }
    return portalShell(result.session, getCookie(sidebarCookie))
  })
