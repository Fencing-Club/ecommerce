import { createFileRoute } from "@tanstack/react-router"
import { authAction } from "../auth-action.server"

export const Route = createFileRoute("/api/action")({
  server: {
    handlers: {
      POST: ({ request }) => authAction(request),
      OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "OPTIONS, POST" } }),
      ANY: () => new Response(null, { status: 405, headers: { Allow: "OPTIONS, POST" } })
    }
  }
})
