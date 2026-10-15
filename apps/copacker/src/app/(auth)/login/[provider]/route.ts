import { notFound, redirect } from "next/navigation"
import { isOAuthProvider } from "@/lib/sign-in"
import { signInRequest } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { authorizationUrl } from "@/server/sign-in"

// "Continue with Google" or Microsoft: off to the provider, with the page to return to and, for an invitation, the
// invited email suggested.
export const GET = withRequest(async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  if (!process.env.WORKOS_CLIENT_ID || !isOAuthProvider(provider)) {
    notFound()
  }
  const query = new URL(request.url).searchParams
  redirect(
    await authorizationUrl(
      await signInRequest(),
      { provider },
      query.get("next") ?? "/",
      query.get("email") ?? undefined
    )
  )
})
