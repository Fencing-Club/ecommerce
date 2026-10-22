import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/catalogs/page"
import { readCatalogs } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/catalogs")({
  loader: () => readCatalogs(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
