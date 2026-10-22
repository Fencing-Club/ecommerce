import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/settings/page"
import { readSettings } from "@/settings-page.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/settings")({
  loader: () => readSettings(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
