import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, PATCH } from "@/server/http/api/inventory/product-labels"

export const Route = createFileRoute("/api/inventory/product-labels")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET()),
      PATCH: ({ request }) => httpResponse(() => PATCH(request))
    }
  }
})
