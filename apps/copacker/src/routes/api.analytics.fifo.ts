import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/analytics/fifo"

export const Route = createFileRoute("/api/analytics/fifo")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request))
    }
  }
})
