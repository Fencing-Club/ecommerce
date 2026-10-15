import { redirect } from "next/navigation"
import { signInRequest } from "@/server/auth"
import { finishOAuth } from "@/server/sign-in"

// WorkOS brings people back here from Google, Microsoft or their company's single sign-on.
export async function GET(request: Request) {
  redirect(await finishOAuth(await signInRequest(), new URL(request.url).searchParams))
}
