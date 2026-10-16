import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, POST } from "@/server/http/api/imports"

export const Route = createFileRoute("/api/imports")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET()),
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
