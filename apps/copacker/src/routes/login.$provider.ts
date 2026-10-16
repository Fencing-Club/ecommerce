import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/login/$provider"

export const Route = createFileRoute("/login/$provider")({
  server: {
    handlers: {
      GET: ({ request, params }) => httpResponse(() => GET(request, { params }))
    }
  }
})
