import { createFileRoute } from "@tanstack/react-router"
import { workspaceProbe } from "../workspace-probe.server"

export const Route = createFileRoute("/workspace")({
  server: { handlers: { POST: () => workspaceProbe() } }
})
