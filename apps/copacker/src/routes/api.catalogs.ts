import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/catalogs"

export const Route = createFileRoute("/api/catalogs")({
  server: {
    handlers: {
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
