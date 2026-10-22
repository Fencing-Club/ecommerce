import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/workspaces/new/page"
import { AppProviders } from "@/components/app-providers"
import { readNewWorkspace } from "@/onboarding.functions"
import { pageHead } from "./-page-route"

export const Route = createFileRoute("/workspaces/new")({
  loader: () => readNewWorkspace(),
  head: pageHead,
  component: Screen
})
function Screen() {
  return (
    <AppProviders>
      <Page page={Route.useLoaderData().page} />
    </AppProviders>
  )
}
