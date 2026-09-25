import { getSignInUrl } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
import { returnPath } from "@/server/security"
export async function GET(request: Request) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  const returnTo = returnPath(new URL(request.url).searchParams.get("next"))
  redirect(await getSignInUrl({ returnTo }))
}
