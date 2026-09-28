/** @jsxRuntime automatic */
import { Layout, Paragraph } from "../layout"
import { renderEmail } from "../render"

export type LabelsReadyProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  shipmentId: string
  // The purchase order's reference.
  reference: string
  // The shipment's number in its purchase order, oldest first as the app numbers them, when it's known.
  shipment?: number
  to: string
}

const title = ({ reference, shipment }: LabelsReadyProps) =>
  shipment ? `Labels ready for ${reference}, shipment ${shipment}` : `Labels ready for ${reference}`
const line = "Open your shipment to print the labels and packing checklist."

export default function LabelsReady(props: LabelsReadyProps) {
  const { appUrl, shipmentId, to } = props
  return (
    <Layout
      action={{ label: "Open shipment", href: `${appUrl}/shipments/${shipmentId}` }}
      appUrl={appUrl}
      heading={title(props)}
      preview={line}
      recipient={to}
    >
      <Paragraph>{line}</Paragraph>
    </Layout>
  )
}

LabelsReady.PreviewProps = {
  appUrl: "http://localhost:3000",
  shipmentId: "00000000-0000-4000-8000-000000000000",
  reference: "TEST-UNIC-1",
  shipment: 1,
  to: "sales@unic.example"
} satisfies LabelsReadyProps

export function labelsReadyEmail(props: LabelsReadyProps) {
  return renderEmail(title(props), <LabelsReady {...props} />)
}
