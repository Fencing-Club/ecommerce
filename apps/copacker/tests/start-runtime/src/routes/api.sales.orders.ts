import { createFileRoute } from "@tanstack/react-router"
import { portalHttp } from "../portal-http.server"

export const Route = createFileRoute("/api/sales/orders")({
  server: {
    handlers: {
      GET: ({ request }) => portalHttp(request, "sales")
    }
  }
})
