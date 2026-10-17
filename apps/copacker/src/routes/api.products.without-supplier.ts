import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/products/without-supplier"

export const Route = createFileRoute("/api/products/without-supplier")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET())
    }
  }
})
