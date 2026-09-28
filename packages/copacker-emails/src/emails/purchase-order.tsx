/** @jsxRuntime automatic */
import { type EmailCopy, Layout } from "../layout"
import { Details, day, type LineItem, LineItems } from "../parts"
import { renderEmail } from "../render"

// How many lines the email lists; the copy's `more` says how many more there are.
export const shownLines = 4

export type PurchaseOrderProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  orderId: string
  // The purchase order's revision; a later one replaces what the supplier had.
  revision: number
  // When the buyer needs the goods, as an ISO date such as 2026-12-01.
  dueDate?: string
  // Where the goods go, such as "Amazon AWD US" or the buyer's warehouse.
  shipTo?: string
  paymentTerms?: string
  // The lines, most valuable first; the email lists the first `shownLines`.
  items: ReadonlyArray<LineItem>
  // The total with its currency, such as "$4,465.00".
  total: string
  // The language the copy is written in, such as "de". Dates and quantities are written in it too.
  lang: string
  // The words, already in the reader's language.
  copy: EmailCopy & {
    action: string
    // That the PDF is attached.
    note: string
    labels: { revision: string; requiredBy: string; shipTo: string; paymentTerms: string; total: string }
    // How many lines the email leaves out, such as "And 2 more products in the purchase order", when there are more
    // than `shownLines`.
    more?: string
  }
}

export default function PurchaseOrder(props: PurchaseOrderProps) {
  const { appUrl, orderId, revision, dueDate, shipTo, paymentTerms, items, total, lang, copy } = props
  const { labels } = copy
  return (
    <Layout
      action={{ label: copy.action, href: `${appUrl}/orders/${orderId}` }}
      appUrl={appUrl}
      copy={copy}
      lang={lang}
    >
      <Details
        rows={[
          ...(revision > 1 ? [{ label: labels.revision, value: revision.toLocaleString(lang) }] : []),
          ...(dueDate ? [{ label: labels.requiredBy, value: day(dueDate, lang) }] : []),
          ...(shipTo ? [{ label: labels.shipTo, value: shipTo }] : []),
          ...(paymentTerms ? [{ label: labels.paymentTerms, value: paymentTerms }] : []),
          { label: labels.total, value: total, strong: true }
        ]}
      />
      <LineItems items={items.slice(0, shownLines)} lang={lang} more={copy.more} />
    </Layout>
  )
}

PurchaseOrder.PreviewProps = {
  appUrl: "http://localhost:3000",
  orderId: "00000000-0000-4000-8000-000000000000",
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
  total: "$4,465.00",
  lang: "en",
  copy: {
    subject: "Purchase order TEST-UNIC-1 from Fencing Club",
    eyebrow: "New purchase order",
    heading: "TEST-UNIC-1 from Fencing Club",
    lead: "Fencing Club sent you a purchase order for 54 units of 6 products.",
    preview: "54 units, $4,465.00, required by Dec 1, 2026",
    labels: {
      revision: "Revision",
      requiredBy: "Required by",
      shipTo: "Ship to",
      paymentTerms: "Payment terms",
      total: "Total"
    },
    more: "And 2 more products in the purchase order",
    action: "Open purchase order",
    note: "The purchase order PDF is attached.",
    reason: "Fencing Club sent this purchase order through Copacker.",
    tagline: "Restocking, handled."
  }
} satisfies PurchaseOrderProps

export function purchaseOrderEmail(props: PurchaseOrderProps) {
  return renderEmail(props.copy.subject, <PurchaseOrder {...props} />)
}
