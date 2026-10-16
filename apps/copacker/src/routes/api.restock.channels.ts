import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/restock/channels"

export const Route = createFileRoute("/api/restock/channels")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET())
    }
  }
})
