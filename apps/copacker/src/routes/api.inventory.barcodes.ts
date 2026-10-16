import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST, GET, DELETE } from "@/server/http/api/inventory/barcodes"

export const Route = createFileRoute("/api/inventory/barcodes")({
  server: {
    handlers: {
      POST: ({ request }) => httpResponse(() => POST(request)),
      GET: ({ request }) => httpResponse(() => GET(request)),
      DELETE: ({ request }) => httpResponse(() => DELETE(request))
    }
  }
})
