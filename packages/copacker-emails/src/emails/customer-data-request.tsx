/** @jsxRuntime automatic */
import { Fragment } from "react"
import { Layout, Paragraph } from "../layout"
import { renderEmail } from "../render"

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
const opening = ({ requestId, shop }: CustomerDataRequestProps) =>
  `Shopify sent Copacker a customer data request (request ${requestId}) for ${shop}.`

// To the store's owners, who answer the customer: what Copacker holds about them.
export default function CustomerDataRequest(props: CustomerDataRequestProps) {
  const { appUrl, orders, to } = props
  return (
    <Layout appUrl={appUrl} heading={title(props)} preview={opening(props)} recipient={to}>
      <Paragraph>{opening(props)}</Paragraph>
      <Paragraph>
        Copacker doesn’t store customers’ names, email addresses, phone numbers, or mailing addresses.
      </Paragraph>
      {orders.length ? (
        <>
          <Paragraph>
            For the orders in the request, Copacker stores only the order details it uses to plan restocks:
          </Paragraph>
          <Paragraph>
            {orders.map((order, index) => (
              <Fragment key={index}>
                {index ? <br /> : null}
                {order}
              </Fragment>
            ))}
          </Paragraph>
        </>
      ) : (
        <Paragraph>Copacker doesn’t hold any of the orders in the request.</Paragraph>
      )}
      <Paragraph>Include this information in your response to the customer.</Paragraph>
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
