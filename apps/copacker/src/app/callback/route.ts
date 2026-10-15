import { redirect } from "next/navigation"
import { signInRequest } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { finishOAuth } from "@/server/sign-in"

// WorkOS brings people back here from Google, Microsoft or their company's single sign-on.
export const GET = withRequest(async function GET(request: Request) {
  redirect(await finishOAuth(await signInRequest(), new URL(request.url).searchParams))
})
