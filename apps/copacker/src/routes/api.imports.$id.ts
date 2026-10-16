import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, DELETE, PATCH, POST } from "@/server/http/api/imports/$id"

export const Route = createFileRoute("/api/imports/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => httpResponse(() => GET(request, { params })),
      DELETE: ({ request, params }) => httpResponse(() => DELETE(request, { params })),
      PATCH: ({ request, params }) => httpResponse(() => PATCH(request, { params })),
      POST: ({ request, params }) => httpResponse(() => POST(request, { params }))
    }
  }
})
