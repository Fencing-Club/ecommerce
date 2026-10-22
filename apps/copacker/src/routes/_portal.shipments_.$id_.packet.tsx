import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/shipments/[id]/packet/page"
import { readShipmentPacket } from "@/shipment-packet.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/shipments_/$id_/packet")({
  loader: ({ params }) => readShipmentPacket({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
