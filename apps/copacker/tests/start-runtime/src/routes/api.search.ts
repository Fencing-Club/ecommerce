import { createFileRoute } from "@tanstack/react-router"
import { portalHttp } from "../portal-http.server"

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: ({ request }) => portalHttp(request, "search")
    }
  }
})
