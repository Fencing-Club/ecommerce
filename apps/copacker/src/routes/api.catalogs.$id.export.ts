import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/catalogs/$id/export"

export const Route = createFileRoute("/api/catalogs/$id/export")({
  server: {
    handlers: {
      GET: ({ request, params }) => httpResponse(() => GET(request, { params }))
    }
  }
})
