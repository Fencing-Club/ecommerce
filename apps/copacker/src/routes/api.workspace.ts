import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { GET } from "@/server/http/api/workspace"

export const Route = createFileRoute("/api/workspace")({
  server: {
    handlers: {
      GET: () => httpResponse(() => GET())
    }
  }
})
