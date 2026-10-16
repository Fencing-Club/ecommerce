import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { DELETE } from "@/server/http/api/catalogs/$id"

export const Route = createFileRoute("/api/catalogs/$id")({
  server: {
    handlers: {
      DELETE: ({ request, params }) => httpResponse(() => DELETE(request, { params }))
    }
  }
})
