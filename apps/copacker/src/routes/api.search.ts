import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/search"

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET())
    }
  }
})
