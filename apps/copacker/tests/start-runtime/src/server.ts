import { createHash, timingSafeEqual } from "node:crypto"
import { getCookie } from "@tanstack/react-start/server"
import handler from "@tanstack/react-start/server-entry"
import { timeZoneCookie } from "../../../src/lib/time-zone"
import { withAuthentication } from "../../../src/server/auth-session"
import { resolveLocalization, withLocalization } from "../../../src/server/localization"
import { closedForMaintenance, underMaintenance } from "../../../src/server/maintenance"
import { maintenanceResponse } from "../../../src/server/start-maintenance"
import { portalLocale } from "./portal-data.server"

export default {
  async fetch(request, env) {
    // A deployed probe must never expose its synthetic login or staging database to anonymous callers.
    // Missing configuration fails closed; the credential is supplied only via an ignored secrets file.
    if (env.PROBE_MODE !== "local") {
      const expected = env.PROBE_ACCESS_TOKEN
      const provided = request.headers.get("Authorization") ?? ""
      const authorized =
        expected &&
        timingSafeEqual(
          createHash("sha256").update(provided).digest(),
          createHash("sha256").update(`Bearer ${expected}`).digest()
        )
      if (!authorized) {
        return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
      }
    }
    // The probe follows browser preferences. Production routes must also supply the authenticated profile's locale.
    // Cookie access is deferred until a Start handler has established its request event.
    // Force only the isolated fixture for acceptance. "live" reads the test environment's real flag without changing
    // it; ordinary probes stay independent of that dashboard setting. No production entry point accepts this header.
    const mode = request.headers.get("x-probe-maintenance")
    const active = mode === "live" ? await underMaintenance() : mode === "on"
    const response = await withLocalization(
      async () =>
        resolveLocalization({
          preferredLocale:
            !active &&
            (new URL(request.url).pathname === "/overview" ||
              new URL(request.url).pathname.startsWith("/query/") ||
              new URL(request.url).pathname.startsWith("/_serverFn/") ||
              request.headers.has("x-probe-portal"))
              ? await portalLocale()
              : undefined,
          acceptLanguage: request.headers.get("accept-language"),
          timeZone: getCookie(timeZoneCookie)
        }),
      () =>
        active && closedForMaintenance(request)
          ? maintenanceResponse(request, (rewritten) => handler.fetch(rewritten))
          : withAuthentication(request, () => handler.fetch(request))
    )
    const headers = new Headers(response.headers)
    headers.set("Cache-Control", "private, no-store")
    headers.set("X-Robots-Tag", "noindex, nofollow")
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
} satisfies ExportedHandler<Cloudflare.Env>
