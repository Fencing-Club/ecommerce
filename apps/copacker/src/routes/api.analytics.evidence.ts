import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/analytics/evidence"

export const Route = createFileRoute("/api/analytics/evidence")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request))
    }
  }
})
