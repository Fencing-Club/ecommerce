import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getCookie } from "@tanstack/react-start/server"
import { z } from "zod"
import { identity } from "@/server/auth"
import { portalSession, portalShell } from "@/server/portal-session"
import { workspaceCookie } from "@/server/workspace-session"

// The cookie the kit's SidebarProvider keeps the sidebar's open state in, so the server renders it as it was left.
const sidebarCookie = "sidebar_state"
// The page's whole URL. A new purchase order's link carries up to 100 variants, about 7,500 characters; Cloudflare
// rejects request URLs over 16 KB before they get here.
const maxPageUrl = 16_384

export const readPortal = createServerFn()
  .validator(z.string().max(maxPageUrl))
  .handler(async ({ data: requested }) => {
    const result = await portalSession(await identity(requested), getCookie(workspaceCookie), requested)
    if (result.redirect) {
      throw redirect({ href: result.redirect })
    }
    return portalShell(result.session, getCookie(sidebarCookie))
  })
