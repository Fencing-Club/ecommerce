import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/connections/$provider"

export const Route = createFileRoute("/api/connections/$provider")({
  server: {
    handlers: {
      GET: ({ request, params }) => httpResponse(() => GET(request, { params }))
    }
  }
})
