import { createFileRoute } from "@tanstack/react-router"
import { underMaintenance } from "@/server/maintenance"

export const Route = createFileRoute("/api/maintenance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Fixture-only controls are behind the staging bearer gate. They never change the actual WorkOS flag.
        const mode = request.headers.get("x-probe-maintenance")
        const active = mode === "live" ? await underMaintenance() : mode === "on"
        return Response.json({ active }, { headers: { "Cache-Control": "no-store" } })
      }
    }
  }
})
