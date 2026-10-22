import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/maintenance/page"
import { AppProviders } from "@/components/app-providers"
import { readMaintenance } from "@/public.functions"
import { pageHead } from "./-page-route"

export const Route = createFileRoute("/maintenance")({
  loader: () => readMaintenance(),
  head: pageHead,
  component: Screen
})
function Screen() {
  return (
    <AppProviders>
      <Page />
    </AppProviders>
  )
}
