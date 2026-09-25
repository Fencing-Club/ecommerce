import { getSignInUrl } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
export async function GET(request: Request) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  const next = new URL(request.url).searchParams.get("next")
  const returnTo = next?.startsWith("/invite?") ? next : "/orders"
  redirect(await getSignInUrl({ returnTo }))
}
