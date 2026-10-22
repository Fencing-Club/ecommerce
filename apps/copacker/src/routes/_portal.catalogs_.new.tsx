import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/catalogs/new/page"
import { readNewCatalog } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/catalogs_/new")({
  loader: () => readNewCatalog(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
