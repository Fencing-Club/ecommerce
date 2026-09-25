import { signOut } from "@workos-inc/authkit-nextjs"
import { appUrl } from "@/server/security"
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return new Response("Forbidden", { status: 403 })
  }
  await signOut({ returnTo: appUrl() })
}
