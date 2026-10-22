import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/page"
import { ordersSearch } from "@/lib/page-search"
import { readOrders } from "@/orders-page.functions"
import { PortalPage, PortalRouteError, pageHead, reloadOnEnter } from "./-page-route"

// The list keeps its view in the URL as it changes, and the page reads it there, so a new view loads nothing.
export const Route = createFileRoute("/_portal/orders")({
  validateSearch: ordersSearch,
  loader: () => readOrders(),
  shouldReload: reloadOnEnter,
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  const search = Route.useSearch()
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} search={search} />}</PortalPage>
}
