import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/[id]/revise/page"
import { readReviseOrder } from "@/revise-order-page.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/orders_/$id_/revise")({
  loader: ({ params }) => readReviseOrder({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
