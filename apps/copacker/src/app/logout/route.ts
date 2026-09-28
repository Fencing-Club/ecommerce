import { signOut } from "@workos-inc/authkit-nextjs"
import { cookies } from "next/headers"
import { appUrl, isAppOrigin, resumeCookie, returnPath, siteUrlFor } from "@/server/security"
// A form can name the page to continue on after signing out, in a `next` field.
export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return new Response("Forbidden", { status: 403 })
  }
  const [form, jar] = await Promise.all([request.formData().catch(() => null), cookies()])
  const next = returnPath(form?.get("next")?.toString(), "")
  if (next) {
    jar.set(resumeCookie, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: appUrl().startsWith("https:"),
      path: "/",
      maxAge: 600
    })
  }
  await signOut({ returnTo: siteUrlFor(request.headers) })
}
