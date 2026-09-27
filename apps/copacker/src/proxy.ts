import { authkitProxy } from "@workos-inc/authkit-nextjs"
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server"
const auth = authkitProxy()
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!process.env.WORKOS_CLIENT_ID) {
    return NextResponse.next()
  }
  return auth(request, event)
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"] }
