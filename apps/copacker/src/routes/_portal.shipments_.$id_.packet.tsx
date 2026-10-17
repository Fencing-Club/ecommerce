import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/shipments/[id]/packet/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { readShipmentPacket } from "@/shipment-packet.functions"

export const Route = createFileRoute("/_portal/shipments_/$id_/packet")({
  loader: ({ params }) => readShipmentPacket({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData ? `${loaderData.forbidden ? loaderData.title : loaderData.page.title} | Copacker` : "Copacker"
      }
    ]
  }),
  component: Screen
})
function Screen() {
  const result = Route.useLoaderData()
  return result.forbidden ? <PortalForbidden /> : <Page page={result.page.data} />
}
