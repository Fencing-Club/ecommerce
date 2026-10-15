import { createHash, timingSafeEqual } from "node:crypto"
import handler from "@tanstack/react-start/server-entry"
import { withAuthentication } from "../../../src/server/auth-session"

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
    const response = await withAuthentication(request, () => handler.fetch(request))
    const headers = new Headers(response.headers)
    headers.set("Cache-Control", "private, no-store")
    headers.set("X-Robots-Tag", "noindex, nofollow")
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
} satisfies ExportedHandler<Cloudflare.Env>
