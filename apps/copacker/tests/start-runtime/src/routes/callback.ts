import { createFileRoute } from "@tanstack/react-router"
import { signInRequest } from "../../../../src/server/auth-session"
import { finishOAuth } from "../../../../src/server/sign-in"

// Exercise the application's canonical callback through Start's real request/cookie context. The enclosing Worker
// requires its private probe token; this route is not registered with any external identity provider.
export const Route = createFileRoute("/callback")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        new Response(null, {
          status: 307,
          headers: { Location: await finishOAuth(signInRequest(), new URL(request.url).searchParams) }
        })
    }
  }
})
