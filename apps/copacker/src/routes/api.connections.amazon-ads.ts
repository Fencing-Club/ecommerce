import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, POST } from "@/server/http/api/connections/amazon-ads"

export const Route = createFileRoute("/api/connections/amazon-ads")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request)),
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
