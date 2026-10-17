import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/api/contact"

export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
