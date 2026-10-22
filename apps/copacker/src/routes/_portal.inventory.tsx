import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/inventory/page"
import { inventorySearch } from "@/lib/page-search"
import { readInventory } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

// The tab the URL names opens first.
export const Route = createFileRoute("/_portal/inventory")({
  validateSearch: inventorySearch,
  loader: () => readInventory(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  const search = Route.useSearch()
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} search={search} />}</PortalPage>
}
