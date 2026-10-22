import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/shipments/[id]/page"
import { readShipment } from "@/shipment-page.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/shipments_/$id")({
  loader: ({ params }) => readShipment({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
