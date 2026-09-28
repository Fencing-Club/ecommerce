/** @jsxRuntime automatic */
import { type EmailCopy, Layout } from "../layout"
import { Details, day, Steps } from "../parts"
import { renderEmail } from "../render"

export type LabelsReadyProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  shipmentId: string
  cartons?: number
  // Where the cartons go, such as "Amazon AWD US" or the buyer's warehouse.
  destination?: string
  // When the cartons are ready for pickup, as an ISO date.
  readyDate?: string
  // Amazon's IDs for the shipment, when it goes to Amazon.
  amazonShipments?: ReadonlyArray<string>
  // The language the copy is written in, such as "de". Dates and numbers are written in it too.
  lang: string
  // The words, already in the reader's language.
  copy: EmailCopy & {
    action: string
    labels: { cartons: string; destination: string; readyForPickup: string; amazonShipment: string }
    // How to label the cartons and hand them over.
    steps: ReadonlyArray<string>
  }
}

export default function LabelsReady(props: LabelsReadyProps) {
  const { appUrl, shipmentId, cartons, destination, readyDate, amazonShipments, lang, copy } = props
  const { labels } = copy
  return (
    <Layout
      action={{ label: copy.action, href: `${appUrl}/shipments/${shipmentId}` }}
      appUrl={appUrl}
      copy={copy}
      lang={lang}
    >
      <Details
        rows={[
          ...(cartons ? [{ label: labels.cartons, value: cartons.toLocaleString(lang) }] : []),
          ...(destination ? [{ label: labels.destination, value: destination }] : []),
          ...(readyDate ? [{ label: labels.readyForPickup, value: day(readyDate, lang) }] : []),
          ...(amazonShipments?.length ? [{ label: labels.amazonShipment, value: amazonShipments.join(", ") }] : [])
        ]}
      />
      <Steps steps={copy.steps} />
    </Layout>
  )
}

LabelsReady.PreviewProps = {
  appUrl: "http://localhost:3000",
  shipmentId: "00000000-0000-4000-8000-000000000000",
  cartons: 6,
  destination: "Amazon AWD US",
  readyDate: "2026-11-20",
  amazonShipments: ["STAR-WBSAXKQKBYMYS"],
  lang: "en",
  copy: {
    subject: "Labels ready for TEST-UNIC-1, shipment 1",
    eyebrow: "Ready to ship",
    heading: "Labels are ready for TEST-UNIC-1, shipment 1",
    lead: "Fencing Club released the shipment, so it’s ready to label and send.",
    preview: "Fencing Club released the shipment, so it’s ready to label and send.",
    labels: {
      cartons: "Cartons",
      destination: "Destination",
      readyForPickup: "Ready for pickup",
      amazonShipment: "Amazon shipment"
    },
    steps: [
      "Print the labels at actual size (100%)",
      "Put each carton’s label on it, covering any other barcode",
      "Check the packing checklist, then hand the cartons to the carrier"
    ],
    action: "Open shipment",
    reason: "Fencing Club released this shipment in Copacker.",
    tagline: "Restocking, handled."
  }
} satisfies LabelsReadyProps

export function labelsReadyEmail(props: LabelsReadyProps) {
  return renderEmail(props.copy.subject, <LabelsReady {...props} />)
}
