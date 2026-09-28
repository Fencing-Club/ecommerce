import { redirect } from "next/navigation"
import { finishOAuth } from "@/server/sign-in"

// WorkOS brings people back here from Google, Microsoft or their company's single sign-on.
export async function GET(request: Request) {
  redirect(await finishOAuth(new URL(request.url).searchParams))
}
