import { createFileRoute } from "@tanstack/react-router"
import { Maintenance } from "@/components/maintenance"
import { Providers } from "@/components/providers"
import { readMaintenancePage } from "../maintenance.functions"

export const Route = createFileRoute("/maintenance")({
  loader: () => readMaintenancePage(),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title }, { name: "robots", content: "noindex" }] }),
  component: MaintenanceRoute
})

function MaintenanceRoute() {
  return (
    <Providers>
      <Maintenance />
    </Providers>
  )
}
