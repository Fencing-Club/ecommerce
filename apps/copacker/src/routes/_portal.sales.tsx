import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/sales/page"
import { salesSearch } from "@/lib/page-search"
import { readSales } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

// The search starts the order list, which loads its own orders.
export const Route = createFileRoute("/_portal/sales")({
  validateSearch: salesSearch,
  loader: () => readSales(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  const search = Route.useSearch()
  return <PortalPage result={Route.useLoaderData()}>{() => <Page search={search} />}</PortalPage>
}
