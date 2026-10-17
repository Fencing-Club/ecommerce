import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { PATCH } from "@/server/http/api/inventory/variant-fields"

export const Route = createFileRoute("/api/inventory/variant-fields")({
  server: {
    handlers: {
      PATCH: ({ request }) => httpResponse(() => PATCH(request))
    }
  }
})
