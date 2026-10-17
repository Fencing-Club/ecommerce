import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/imports/$id/save"

export const Route = createFileRoute("/api/imports/$id/save")({
  server: {
    handlers: {
      POST: ({ request, params }) => httpResponse(() => POST(request, { params }))
    }
  }
})
