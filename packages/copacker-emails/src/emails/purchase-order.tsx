/** @jsxRuntime automatic */
import { Layout, Paragraph } from "../layout"
import { renderEmail } from "../render"

export type PurchaseOrderProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  orderId: string
  reference: string
  // The buyer's workspace name.
  buyer: string
  // When the buyer needs the goods, as an ISO date such as 2026-12-01.
  dueDate?: string
  to: string
}

// A date such as "Dec 1, 2026". It has no time of day, so it's read in UTC to stay the same day everywhere.
const day = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })

const title = ({ reference, buyer }: PurchaseOrderProps) => `Purchase order ${reference} from ${buyer}`
const summary = ({ dueDate }: PurchaseOrderProps) =>
  dueDate ? `Required by ${day(dueDate)}. The PDF is attached.` : "The PDF is attached."

export default function PurchaseOrder(props: PurchaseOrderProps) {
  const { appUrl, orderId, to } = props
  return (
    <Layout
      action={{ label: "Open purchase order", href: `${appUrl}/orders/${orderId}` }}
      appUrl={appUrl}
      heading={title(props)}
      preview={summary(props)}
      recipient={to}
    >
      <Paragraph>{summary(props)}</Paragraph>
    </Layout>
  )
}

PurchaseOrder.PreviewProps = {
  appUrl: "http://localhost:3000",
  orderId: "00000000-0000-4000-8000-000000000000",
  reference: "TEST-UNIC-1",
  buyer: "Fencing Club",
  dueDate: "2026-12-01",
  to: "sales@unic.example"
} satisfies PurchaseOrderProps

export function purchaseOrderEmail(props: PurchaseOrderProps) {
  return renderEmail(title(props), <PurchaseOrder {...props} />)
}
