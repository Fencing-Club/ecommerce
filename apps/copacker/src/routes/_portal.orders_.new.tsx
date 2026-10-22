import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/new/page"
import { newOrderSearch } from "@/lib/page-search"
import { readNewOrder } from "@/new-order-page.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

// The URL's variants, supplier and destination start the new purchase order.
export const Route = createFileRoute("/_portal/orders_/new")({
  validateSearch: newOrderSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readNewOrder({ data: deps }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
