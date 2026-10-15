import { createFileRoute } from "@tanstack/react-router"
import { isOAuthProvider } from "../../../../src/lib/sign-in"
import { signInRequest } from "../../../../src/server/auth-session"
import { authorizationUrl } from "../../../../src/server/sign-in"

// Generates the same PKCE/state cookie as the application, without following the provider URL or creating an account.
export const Route = createFileRoute("/login/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!process.env.WORKOS_CLIENT_ID || !isOAuthProvider(params.provider)) {
          return new Response(null, { status: 404 })
        }
        const query = new URL(request.url).searchParams
        const location = await authorizationUrl(
          signInRequest(),
          { provider: params.provider },
          query.get("next") ?? "/",
          query.get("email") ?? undefined
        )
        return new Response(null, { status: 307, headers: { Location: location } })
      }
    }
  }
})
