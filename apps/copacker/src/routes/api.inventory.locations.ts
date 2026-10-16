import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET, PATCH } from "@/server/http/api/inventory/locations"

export const Route = createFileRoute("/api/inventory/locations")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET()),
      PATCH: ({ request }) => httpResponse(() => PATCH(request))
    }
  }
})
