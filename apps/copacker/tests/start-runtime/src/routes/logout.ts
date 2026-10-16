import { createFileRoute } from "@tanstack/react-router"
import { setCookie } from "@tanstack/react-start/server"
import { signOut } from "@/server/auth-session"
import { errorTextResponse } from "@/server/errors"
import { appUrl, isAppOrigin, resumeCookie, returnPath } from "@/server/security"

export const Route = createFileRoute("/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAppOrigin(request.headers.get("origin"))) {
          return errorTextResponse("forbidden", 403)
        }
        const form = await request.formData().catch(() => null)
        const next = returnPath(form?.get("next")?.toString(), "")
        if (next) {
          setCookie(resumeCookie, next, {
            httpOnly: true,
            secure: appUrl().startsWith("https:"),
            sameSite: "lax",
            path: "/",
            maxAge: 600
          })
        }
        return new Response(null, { status: 303, headers: { Location: await signOut(appUrl()) } })
      },
      ANY: () => new Response(null, { status: 405, headers: { Allow: "POST" } })
    }
  }
})
