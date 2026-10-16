import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/sales"

export const Route = createFileRoute("/api/sales")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET())
    }
  }
})
