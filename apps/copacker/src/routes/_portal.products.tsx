import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/products/page"
import { productsSearch } from "@/lib/page-search"
import { readProducts } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

// A buyer's search starts the product list, which loads its own rows. ?import= only opens a dialog.
export const Route = createFileRoute("/_portal/products")({
  validateSearch: productsSearch,
  loader: () => readProducts(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  const search = Route.useSearch()
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} search={search} />}</PortalPage>
}
