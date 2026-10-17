import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { POST, GET } from "@/server/http/api/product-images"

export const Route = createFileRoute("/api/product-images")({
  server: {
    handlers: {
      POST: ({ request }) => httpResponse(() => POST(request)),
      GET: ({ request }) => httpResponse(() => GET(request))
    }
  }
})
