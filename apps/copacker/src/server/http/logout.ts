import { setCookie } from "@tanstack/react-start/server"
import { signOut } from "@/server/auth-session"
import { errorTextResponse } from "@/server/errors"
import { appUrl, isAppOrigin, resumeCookie, returnPath, siteUrlFor } from "@/server/security"

export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorTextResponse("forbidden", 403)
  }
  const form = await request.formData().catch(() => null)
  const next = returnPath(form?.get("next")?.toString(), "")
  if (next) {
    setCookie(resumeCookie, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: appUrl().startsWith("https:"),
      path: "/",
      maxAge: 600
    })
  }
  return Response.redirect(await signOut(siteUrlFor(request.headers)), 303)
}
