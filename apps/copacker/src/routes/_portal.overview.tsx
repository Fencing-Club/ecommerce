import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/overview/page"
import { overviewSearch } from "@/lib/page-search"
import { readOverview } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

// The Overview's figures are for the URL's period and channel.
export const Route = createFileRoute("/_portal/overview")({
  validateSearch: overviewSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readOverview({ data: deps }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  const search = Route.useSearch()
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} search={search} />}</PortalPage>
}
