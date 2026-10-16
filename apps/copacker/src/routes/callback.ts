import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/callback"

export const Route = createFileRoute("/callback")({
  server: {
    handlers: {
      GET: ({ request }) => httpResponse(() => GET(request))
    }
  }
})
