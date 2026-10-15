import { createHash, timingSafeEqual } from "node:crypto"
import { getCookie } from "@tanstack/react-start/server"
import handler from "@tanstack/react-start/server-entry"
import { timeZoneCookie } from "../../../src/lib/time-zone"
import { withAuthentication } from "../../../src/server/auth-session"
import { resolveLocalization, withLocalization } from "../../../src/server/localization"

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
    const response = await withLocalization(
      () =>
        resolveLocalization({
          acceptLanguage: request.headers.get("accept-language"),
          timeZone: getCookie(timeZoneCookie)
        }),
      () => withAuthentication(request, () => handler.fetch(request))
    )
    const headers = new Headers(response.headers)
    headers.set("Cache-Control", "private, no-store")
    headers.set("X-Robots-Tag", "noindex, nofollow")
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
} satisfies ExportedHandler<Cloudflare.Env>
