import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, POST } from "@/server/http/api/webhooks/ebay"

export const Route = createFileRoute("/api/webhooks/ebay")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request)),
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
