import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/[id]/edit/page"
import { readEditOrder } from "@/edit-order-page.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/orders_/$id_/edit")({
  loader: ({ params }) => readEditOrder({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
