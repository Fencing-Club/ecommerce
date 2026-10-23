import { createFileRoute } from "@tanstack/react-router"
import { cliTransfer } from "@/server/operation-transfers"
export const Route = createFileRoute("/api/cli/transfers/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => cliTransfer(request, params.id),
      PUT: ({ request, params }) => cliTransfer(request, params.id)
    }
  }
})
