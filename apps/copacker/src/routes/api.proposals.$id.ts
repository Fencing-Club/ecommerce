import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/proposals/$id"

export const Route = createFileRoute("/api/proposals/$id")({
  server: {
    handlers: {
      POST: ({ request, params }) => httpResponse(() => POST(request, { params }))
    }
  }
})
