import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, POST } from "@/server/http/api/analytics/landed-charges"

export const Route = createFileRoute("/api/analytics/landed-charges")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request)),
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
