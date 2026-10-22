import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/restock/page"
import { restockSearch } from "@/lib/page-search"
import { readRestock } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead, reloadOnEnter } from "./-page-route"

// A link's filters start the report, which loads its own suggestions.
export const Route = createFileRoute("/_portal/restock")({
  validateSearch: restockSearch,
  loader: () => readRestock(),
  shouldReload: reloadOnEnter,
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  const search = Route.useSearch()
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} search={search} />}</PortalPage>
}
