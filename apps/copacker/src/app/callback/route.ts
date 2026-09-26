import { handleAuth } from "@workos-inc/authkit-nextjs"
import type { NextRequest } from "next/server"
import { appUrl } from "@/server/security"

export function GET(request: NextRequest) {
  return handleAuth({ returnPathname: "/", baseURL: appUrl() })(request)
}
