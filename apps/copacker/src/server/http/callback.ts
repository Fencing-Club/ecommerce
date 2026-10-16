import { signInRequest } from "@/server/auth-session"
import { appUrl } from "@/server/security"
import { finishOAuth } from "@/server/sign-in"

export async function GET(request: Request) {
  return Response.redirect(
    new URL(await finishOAuth(signInRequest(), new URL(request.url).searchParams), appUrl()),
    303
  )
}
