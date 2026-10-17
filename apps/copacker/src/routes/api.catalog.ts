import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/catalog"

export const Route = createFileRoute("/api/catalog")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request))
    }
  }
})
