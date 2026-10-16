import { getCookie } from "@tanstack/react-start/server"
import handler from "@tanstack/react-start/server-entry"
import { eq } from "drizzle-orm"
import { db, withDatabase } from "@/db"
import { profiles } from "@/db/schema"
import { timeZoneCookie } from "@/lib/time-zone"
import { signedInUser } from "@/server/auth"
import { withAuthentication } from "@/server/auth-session"
import { resolveLocalization, withLocalization } from "@/server/localization"
import { closedForMaintenance, underMaintenance } from "@/server/maintenance"
import { maintenanceResponse } from "@/server/start-maintenance"
import { withFileStorage } from "@/server/storage"

export default {
  async fetch(request, env) {
    const active = await underMaintenance()
    const render = () => handler.fetch(request)
    const response = await withLocalization(
      async () => {
        const user = active ? null : await signedInUser()
        const [profile] = user
          ? await db().select({ locale: profiles.locale }).from(profiles).where(eq(profiles.userId, user.id))
          : []
        return resolveLocalization({
          preferredLocale: profile?.locale,
          acceptLanguage: request.headers.get("accept-language"),
          timeZone: getCookie(timeZoneCookie)
        })
      },
      () =>
        active && closedForMaintenance(request)
          ? maintenanceResponse(request, render)
          : withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, () =>
              withFileStorage(
                {
                  put: async (key, bytes, contentType) => {
                    await env.DOCUMENTS.put(key, bytes, { httpMetadata: { contentType } })
                  },
                  get: async (key) => {
                    const file = await env.DOCUMENTS.get(key)
                    return file
                      ? { body: file.body, size: file.size, contentType: file.httpMetadata?.contentType }
                      : null
                  },
                  delete: (key) => env.DOCUMENTS.delete(key)
                },
                () => withAuthentication(request, render)
              )
            )
    )
    const headers = new Headers(response.headers)
    headers.set("Cache-Control", "private, no-store")
    headers.set("X-Content-Type-Options", "nosniff")
    headers.set("Referrer-Policy", "same-origin")
    if (env.DEPLOYMENT_ENV !== "production") {
      headers.set("X-Robots-Tag", "noindex, nofollow")
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
} satisfies ExportedHandler<Cloudflare.Env>
