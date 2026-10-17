import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { PATCH } from "@/server/http/api/inventory/product-defaults"

export const Route = createFileRoute("/api/inventory/product-defaults")({
  server: {
    handlers: {
      PATCH: ({ request }) => httpResponse(() => PATCH(request))
    }
  }
})
