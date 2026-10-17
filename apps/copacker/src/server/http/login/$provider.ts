import { isOAuthProvider } from "@/lib/sign-in"
import { signInRequest } from "@/server/auth-session"
import { authorizationUrl } from "@/server/sign-in"

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const { provider } = params
  if (!process.env.WORKOS_CLIENT_ID || !isOAuthProvider(provider)) {
    return new Response(null, { status: 404 })
  }
  const query = new URL(request.url).searchParams
  return Response.redirect(
    await authorizationUrl(signInRequest(), { provider }, query.get("next") ?? "/", query.get("email") ?? undefined),
    303
  )
}
