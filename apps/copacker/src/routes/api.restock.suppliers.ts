import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/restock/suppliers"

export const Route = createFileRoute("/api/restock/suppliers")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET())
    }
  }
})
