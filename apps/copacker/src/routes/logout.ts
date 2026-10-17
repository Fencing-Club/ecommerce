import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST } from "@/server/http/logout"

export const Route = createFileRoute("/logout")({
  server: {
    handlers: {
      POST: ({ request }) => httpResponse(() => POST(request))
    }
  }
})
