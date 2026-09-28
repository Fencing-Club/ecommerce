/** @jsxRuntime automatic */
import { Layout } from "../layout"
import { Details, day, Steps } from "../parts"
import { renderEmail } from "../render"

export type LabelsReadyProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  shipmentId: string
  // The purchase order's reference.
  reference: string
  // The buyer's workspace name.
  buyer: string
  // The shipment's number in its purchase order, oldest first as the app numbers them, when it's known.
  shipment?: number
  cartons?: number
  // Where the cartons go, such as "Amazon AWD US" or the buyer's warehouse.
  destination?: string
  // When the cartons are ready for pickup, as an ISO date.
  readyDate?: string
  // Amazon's IDs for the shipment, when it goes to Amazon.
  amazonShipments?: ReadonlyArray<string>
  to: string
}

const title = ({ reference, shipment }: LabelsReadyProps) =>
  shipment ? `Labels ready for ${reference}, shipment ${shipment}` : `Labels ready for ${reference}`

export default function LabelsReady(props: LabelsReadyProps) {
  const { appUrl, shipmentId, reference, buyer, shipment, cartons, destination, readyDate, amazonShipments } = props
  const lead = `${buyer} released the shipment, so it’s ready to label and send.`
  return (
    <Layout
      action={{ label: "Open shipment", href: `${appUrl}/shipments/${shipmentId}` }}
      appUrl={appUrl}
      eyebrow="Ready to ship"
      heading={
        shipment ? `Labels are ready for ${reference}, shipment ${shipment}` : `Labels are ready for ${reference}`
      }
      lead={lead}
      preview={lead}
      reason={`${buyer} released this shipment in Copacker.`}
    >
      <Details
        rows={[
          ...(cartons ? [{ label: "Cartons", value: cartons.toLocaleString("en-US") }] : []),
          ...(destination ? [{ label: "Destination", value: destination }] : []),
          ...(readyDate ? [{ label: "Ready for pickup", value: day(readyDate) }] : []),
          ...(amazonShipments?.length ? [{ label: "Amazon shipment", value: amazonShipments.join(", ") }] : [])
        ]}
      />
      <Steps
        steps={[
          "Print the labels at actual size (100%)",
          "Put each carton’s label on it, covering any other barcode",
          "Check the packing checklist, then hand the cartons to the carrier"
        ]}
      />
    </Layout>
  )
}

LabelsReady.PreviewProps = {
  appUrl: "http://localhost:3000",
  shipmentId: "00000000-0000-4000-8000-000000000000",
  reference: "TEST-UNIC-1",
  buyer: "Fencing Club",
  shipment: 1,
  cartons: 6,
  destination: "Amazon AWD US",
  readyDate: "2026-11-20",
  amazonShipments: ["STAR-WBSAXKQKBYMYS"],
  to: "sales@unic.example"
} satisfies LabelsReadyProps

export function labelsReadyEmail(props: LabelsReadyProps) {
  return renderEmail(title(props), <LabelsReady {...props} />)
}
