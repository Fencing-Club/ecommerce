/** @jsxRuntime automatic */
import { Layout } from "../layout"
import { Details, day, type LineItem, LineItems } from "../parts"
import { renderEmail } from "../render"

export type PurchaseOrderProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  orderId: string
  reference: string
  // The buyer's workspace name.
  buyer: string
  // The purchase order's revision; a later one replaces what the supplier had.
  revision: number
  // When the buyer needs the goods, as an ISO date such as 2026-12-01.
  dueDate?: string
  // Where the goods go, such as "Amazon AWD US" or the buyer's warehouse.
  shipTo?: string
  paymentTerms?: string
  // The lines, most valuable first; the email shows the first few.
  items: ReadonlyArray<LineItem>
  units: number
  // The total with its currency, such as "$4,465.00".
  total: string
  to: string
}

// How many lines the email lists before saying how many more there are.
const shown = 4

const title = ({ reference, buyer }: PurchaseOrderProps) => `Purchase order ${reference} from ${buyer}`
const count = (value: number, noun: string) => `${value.toLocaleString("en-US")} ${noun}${value === 1 ? "" : "s"}`

export default function PurchaseOrder(props: PurchaseOrderProps) {
  const { appUrl, orderId, reference, buyer, revision, dueDate, shipTo, paymentTerms, items, units, total } = props
  const revised = revision > 1
  const lead = revised
    ? `${buyer} changed this purchase order. The updated version replaces the one you had.`
    : `${buyer} sent you a purchase order for ${count(units, "unit")} of ${count(items.length, "product")}.`
  return (
    <Layout
      action={{ label: "Open purchase order", href: `${appUrl}/orders/${orderId}` }}
      appUrl={appUrl}
      eyebrow={revised ? "Revised purchase order" : "New purchase order"}
      heading={`${reference} from ${buyer}`}
      lead={lead}
      note="The purchase order PDF is attached."
      preview={[count(units, "unit"), total, dueDate ? `required by ${day(dueDate)}` : null].filter(Boolean).join(", ")}
      reason={`${buyer} sent this purchase order through Copacker.`}
    >
      <Details
        rows={[
          ...(revised ? [{ label: "Revision", value: String(revision) }] : []),
          ...(dueDate ? [{ label: "Required by", value: day(dueDate) }] : []),
          ...(shipTo ? [{ label: "Ship to", value: shipTo }] : []),
          ...(paymentTerms ? [{ label: "Payment terms", value: paymentTerms }] : []),
          { label: "Total", value: total, strong: true }
        ]}
      />
      <LineItems items={items.slice(0, shown)} more={Math.max(0, items.length - shown)} />
    </Layout>
  )
}

PurchaseOrder.PreviewProps = {
  appUrl: "http://localhost:3000",
  orderId: "00000000-0000-4000-8000-000000000000",
  reference: "TEST-UNIC-1",
  buyer: "Fencing Club",
  revision: 1,
  dueDate: "2026-12-01",
  shipTo: "Fencing Club warehouse",
  paymentTerms: "Net 30",
  items: [
    {
      quantity: 14,
      name: "Unic Epee Arrow Blade (Non-FIE)",
      detail: "#5 / Titanium Point, UF-9035",
      amount: "$1,120.00"
    },
    {
      quantity: 10,
      name: "Unic Epee F1 Blade (Non-FIE)",
      detail: "#5 / Medium / Titanium Point, UF-7825M",
      amount: "$785.00"
    },
    {
      quantity: 10,
      name: "Unic Epee F1 Blade (Non-FIE)",
      detail: "#5 / Hard / Unic Point, UF-7815H",
      amount: "$725.00"
    },
    { quantity: 7, name: "Unic Epee Arrow Blade (Non-FIE)", detail: "#5 / Bare, UF-9005", amount: "$472.50" },
    {
      quantity: 8,
      name: "Unic Foil Blade (Non-FIE)",
      detail: "#5 / Medium / German Point, UF-6025M",
      amount: "$424.00"
    },
    {
      quantity: 5,
      name: "Unic Epee F1 Blade (Non-FIE)",
      detail: "#5 / Hard / Titanium Point, UF-7825H",
      amount: "$392.50"
    }
  ],
  units: 70,
  total: "$4,465.00",
  to: "sales@unic.example"
} satisfies PurchaseOrderProps

export function purchaseOrderEmail(props: PurchaseOrderProps) {
  return renderEmail(title(props), <PurchaseOrder {...props} />)
}
