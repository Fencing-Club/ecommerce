import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getCookie, setResponseStatus } from "@tanstack/react-start/server"
import { z } from "zod"
import { can } from "@/lib/access"
import { portalSession } from "@/server/portal-session"
import { workspaceCookie } from "@/server/workspace-session"
import { portalData } from "./portal-data.server"

// Real controls and real permission resolution, with the compatibility fixture's isolated tables. This route does
// not enable partner invitations or product imports against staging; its scope is URL state and form interaction.
export const readQueryControls = createServerFn()
  .validator(z.enum(["partners", "products"]))
  .handler(({ data }) =>
    portalData(async (user) => {
      const resolved = await portalSession(user, getCookie(workspaceCookie), `/query/${data}`)
      if (resolved.redirect) {
        throw redirect({ href: resolved.redirect })
      }
      const { session } = resolved
      const permissions = { role: session.role, access: session.access }
      const allowed = can(session, data)
      if (!allowed) {
        setResponseStatus(403)
      }
      return { permissions, allowed, editable: can(session, data, "edit") }
    })
  )
