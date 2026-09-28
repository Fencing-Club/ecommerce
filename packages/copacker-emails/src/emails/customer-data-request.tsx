/** @jsxRuntime automatic */
import { Fragment } from "react"
import { Section, Text } from "react-email"
import { Layout } from "../layout"
import { Details } from "../parts"
import { renderEmail } from "../render"
import { color, font } from "../theme"

export type CustomerDataRequestProps = {
  // Copacker's origin, such as https://copacker.example.
  appUrl: string
  // The store's Shopify domain, such as club.myshopify.com.
  shop: string
  // Shopify's ID for the request.
  requestId: number
  // The requested orders Copacker holds, one line each.
  orders: string[]
  to: string
}

const title = ({ shop }: CustomerDataRequestProps) => `Customer data request for ${shop}`

// To the store's owners, who answer the customer: what Copacker holds about them.
export default function CustomerDataRequest(props: CustomerDataRequestProps) {
  const { appUrl, shop, requestId, orders } = props
  const lead =
    "Shopify sent Copacker a customer data request. Include what Copacker holds in your reply to the customer."
  return (
    <Layout
      appUrl={appUrl}
      eyebrow="Shopify data request"
      heading={title(props)}
      lead={lead}
      note="Copacker doesn’t store customers’ names, email addresses, phone numbers, or mailing addresses."
      preview={lead}
      reason={`Shopify sent a customer data request for ${shop}, which is connected to Copacker.`}
    >
      <Details
        rows={[
          { label: "Store", value: shop },
          { label: "Request", value: String(requestId) },
          { label: "Orders Copacker holds", value: orders.length ? orders.length.toLocaleString("en-US") : "None" }
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
            Only the order details Copacker uses to plan restocks:
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
  to: "owner@club.example"
} satisfies CustomerDataRequestProps

export function customerDataRequestEmail(props: CustomerDataRequestProps) {
  return renderEmail(title(props), <CustomerDataRequest {...props} />)
}
