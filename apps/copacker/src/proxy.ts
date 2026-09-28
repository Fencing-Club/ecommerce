import { authkitProxy } from "@workos-inc/authkit-nextjs"
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server"
import { appUrl, resumeCookie, returnPath } from "@/server/security"
const auth = authkitProxy()
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Back from signing out to continue on another page, such as an invitation for another email.
  const resume = request.cookies.get(resumeCookie)?.value
  if (resume && request.nextUrl.pathname === "/") {
    const response = NextResponse.redirect(new URL(returnPath(resume, "/"), appUrl()))
    response.cookies.delete(resumeCookie)
    return response
  }
  if (!process.env.WORKOS_CLIENT_ID) {
    return NextResponse.next()
  }
  return auth(request, event)
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"] }
