import { createFileRoute } from "@tanstack/react-router"
import { httpResponse } from "@/server/http-response"
import { recoverWorkspace } from "@/server/workspace-recovery"

export const Route = createFileRoute("/workspaces/recover")({
  server: { handlers: { GET: ({ request }) => httpResponse(request, recoverWorkspace) } }
})
