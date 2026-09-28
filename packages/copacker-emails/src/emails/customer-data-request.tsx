/** @jsxRuntime automatic */
import { Fragment } from "react"
import { Section, Text } from "react-email"
import { type EmailCopy, Layout } from "../layout"
import { Details } from "../parts"
import { renderEmail } from "../render"
import { color, font } from "../theme"

export type CustomerDataRequestProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  // The store's Shopify domain, such as club.myshopify.com.
  shop: string
  requestId: number
  // The requested orders Copacker holds, one line each.
  orders: ReadonlyArray<string>
  // The language the copy is written in, such as "de". Numbers are written in it too.
  lang: string
  // The words, already in the reader's language. The note says Copacker holds no customer contact details.
  copy: EmailCopy & {
    note: string
    labels: { store: string; request: string; ordersHeld: string }
    // Said instead of how many orders Copacker holds when it holds none.
    none: string
    // What the order lines are, before them.
    ordersIntro: string
  }
}

// To the store's owners, who answer the customer: what Copacker holds about them.
export default function CustomerDataRequest({ appUrl, copy, lang, orders, requestId, shop }: CustomerDataRequestProps) {
  const { labels } = copy
  return (
    <Layout appUrl={appUrl} copy={copy} lang={lang}>
      <Details
        rows={[
          { label: labels.store, value: shop },
          { label: labels.request, value: String(requestId) },
          { label: labels.ordersHeld, value: orders.length ? orders.length.toLocaleString(lang) : copy.none }
        ]}
      />
      {orders.length ? (
        <Section
          className="cp-panel"
          style={{
            backgroundColor: color.panel,
            border: `1px solid ${color.line}`,
            borderRadius: 12,
            margin: "0 0 8px",
            padding: "14px 18px"
          }}
        >
          <Text
            className="cp-muted"
            style={{ color: color.muted, fontFamily: font, fontSize: 13, lineHeight: "20px", margin: "0 0 8px" }}
          >
            {copy.ordersIntro}
          </Text>
          {/* One paragraph with a line for each order, so the plain text lists them on consecutive lines too. */}
          <Text
            className="cp-ink"
            style={{
              color: color.ink,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
              fontSize: 13,
              lineHeight: "20px",
              margin: 0
            }}
          >
            {orders.map((order, index) => (
              <Fragment key={order}>
                {index ? <br /> : null}
                {order}
              </Fragment>
            ))}
          </Text>
        </Section>
      ) : null}
    </Layout>
  )
}

CustomerDataRequest.PreviewProps = {
  appUrl: "http://localhost:3000",
  shop: "club.myshopify.com",
  requestId: 42,
  orders: [
    "Order #1001, placed 2026-09-01, status Unfulfilled: 2 × CORD-2",
    "Order #1003, placed 2026-09-04, status Fulfilled: 1 × MASK-1"
  ],
  lang: "en",
  copy: {
    subject: "Customer data request for club.myshopify.com",
    eyebrow: "Shopify data request",
    heading: "Customer data request for club.myshopify.com",
    lead: "Shopify sent Copacker a customer data request. Include what Copacker holds in your reply to the customer.",
    preview:
      "Shopify sent Copacker a customer data request. Include what Copacker holds in your reply to the customer.",
    labels: { store: "Store", request: "Request", ordersHeld: "Orders Copacker holds" },
    none: "None",
    ordersIntro: "Only the order details Copacker uses to plan restocks:",
    note: "Copacker doesn’t store customers’ names, email addresses, phone numbers, or mailing addresses.",
    reason: "Shopify sent a customer data request for club.myshopify.com, which is connected to Copacker.",
    tagline: "Restocking, handled."
  }
} satisfies CustomerDataRequestProps

export function customerDataRequestEmail(props: CustomerDataRequestProps) {
  return renderEmail(props.copy.subject, <CustomerDataRequest {...props} />)
}
