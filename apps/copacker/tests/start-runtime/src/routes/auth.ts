import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { authentication, signInRequest, signOut } from "../../../../src/server/auth-session"
import { signIn } from "../../../../src/server/sign-in"

// The enclosing Worker requires the private probe token. This handler exercises real WorkOS test-environment
// credentials without exposing tokens or modifying an account. It is never part of the application route tree.
export const Route = createFileRoute("/auth")({
  server: {
    handlers: {
      GET: async () => {
        const auth = await authentication()
        return Response.json({ userId: auth.user?.id ?? null })
      },
      POST: async ({ request }) => {
        const input = z.object({ email: z.email(), password: z.string().min(1) }).parse(await request.json())
        if (!process.env.WORKOS_API_KEY?.startsWith("sk_test_")) {
          return new Response(null, { status: 503 })
        }
        // Exercise replacement when an incoming session refreshes during a new login.
        await authentication()
        return Response.json(await signIn(signInRequest(), input))
      },
      DELETE: async () =>
        new Response(null, { status: 303, headers: { Location: await signOut("https://copacker.ai") } })
    }
  }
})
