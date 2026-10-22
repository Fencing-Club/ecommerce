import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/shipments/page"
import { shipmentsSearch } from "@/lib/page-search"
import { readShipments } from "@/shipments-page.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

// The list keeps its view in the URL as it changes, and the page reads it there, so a new view loads nothing.
export const Route = createFileRoute("/_portal/shipments")({
  validateSearch: shipmentsSearch,
  loader: () => readShipments(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  const search = Route.useSearch()
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} search={search} />}</PortalPage>
}
