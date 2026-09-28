import { describe, expect, it } from "vitest"
import {
  customerDataRequestEmail,
  invitationEmail,
  labelsReadyEmail,
  purchaseOrderEmail,
  type Email
} from "../src/index"

const appUrl = "https://copacker.example"
const to = "sales@unic.example"

// How the HTML has a piece of copy: with its ampersands and straight apostrophes escaped.
const escaped = (copy: string) => copy.replaceAll("&", "&amp;").replaceAll("'", "&#x27;")

// Each piece of copy is in the HTML and the plain text, and neither says "PO" or separates with a dot.
function expectInBoth(email: Email, ...copy: string[]) {
  for (const piece of copy) {
    expect(email.html).toContain(escaped(piece))
    expect(email.text).toContain(piece)
  }
  expect(`${email.html}\n${email.text}`).not.toMatch(/\bPO\b|[·•]/)
}

describe("invitation", () => {
  it.each([
    ["supplier", "Join as their supplier and get their purchase orders there."],
    ["team", "Join their workspace."],
    ["forwarder", "Join as their freight forwarder and share your warehouse addresses with them."]
  ] as const)("invites a %s, with a button to accept", async (kind, joining) => {
    const email = await invitationEmail({ appUrl, kind, from: "Fencing Club", to, token: "token-1" })
    expect(email.subject).toBe("Fencing Club invited you to Copacker")
    expectInBoth(
      email,
      email.subject,
      joining,
      "Accept invitation",
      `${appUrl}/invite?token=token-1&kind=${kind}`,
      `It’s for ${to} and expires in 7 days.`,
      "Sent by Copacker"
    )
    // The note names the address, so the footer doesn't again.
    expect(email.text).not.toContain("Sent by Copacker to")
  })
})

describe("purchase order", () => {
  const order = {
    appUrl,
    orderId: "5b0e8d52-7c0f-4f4e-9d4a-3f1f5f0b8c11",
    reference: "TEST-UNIC-1",
    buyer: "Fencing Club",
    to
  }

  it("says who sent it, when it's required by and that the PDF is attached", async () => {
    const email = await purchaseOrderEmail({ ...order, dueDate: "2026-12-01" })
    expect(email.subject).toBe("Purchase order TEST-UNIC-1 from Fencing Club")
    expectInBoth(
      email,
      email.subject,
      "Required by Dec 1, 2026. The PDF is attached.",
      "Open purchase order",
      `${appUrl}/orders/${order.orderId}`,
      `Sent by Copacker to ${to}`
    )
  })

  it("leaves the date out when there's none", async () => {
    const email = await purchaseOrderEmail(order)
    expectInBoth(email, "The PDF is attached.")
    expect(email.text).not.toContain("Required by")
  })
})

describe("labels ready", () => {
  const shipment = { appUrl, shipmentId: "0c5a9f3e-2b1d-4c8e-a7f6-9d2e4b6c8a10", reference: "TEST-UNIC-1", to }

  it("names the shipment by its number", async () => {
    const email = await labelsReadyEmail({ ...shipment, shipment: 1 })
    expect(email.subject).toBe("Labels ready for TEST-UNIC-1, shipment 1")
    expectInBoth(
      email,
      email.subject,
      "Open your shipment to print the labels and packing checklist.",
      "Open shipment",
      `${appUrl}/shipments/${shipment.shipmentId}`,
      `Sent by Copacker to ${to}`
    )
  })

  it("names only the purchase order when the shipment's number isn't known", async () => {
    const email = await labelsReadyEmail(shipment)
    expect(email.subject).toBe("Labels ready for TEST-UNIC-1")
    expectInBoth(email, email.subject)
  })
})

describe("customer data request", () => {
  const request = { appUrl, shop: "club.myshopify.com", requestId: 42, to: "owner@club.example" }

  it("lists the requested orders Copacker holds, one a line", async () => {
    const orders = [
      "Order #1001, placed 2026-09-01, status Unfulfilled: 2 × CORD-2",
      "Order #1003, placed 2026-09-04, status Fulfilled: 1 × MASK-1"
    ]
    const email = await customerDataRequestEmail({ ...request, orders })
    expect(email.subject).toBe("Customer data request for club.myshopify.com")
    expectInBoth(
      email,
      email.subject,
      "Shopify sent Copacker a customer data request (request 42) for club.myshopify.com.",
      "Copacker doesn’t store customers’ names, email addresses, phone numbers, or mailing addresses.",
      "For the orders in the request, Copacker stores only the order details it uses to plan restocks:",
      ...orders,
      "Include this information in your response to the customer.",
      "Sent by Copacker to owner@club.example"
    )
    expect(email.text).toContain(orders.join("\n"))
  })

  it("says when Copacker holds none of the orders", async () => {
    const email = await customerDataRequestEmail({ ...request, orders: [] })
    expectInBoth(email, "Copacker doesn’t hold any of the orders in the request.")
    expect(email.text).not.toContain("stores only the order details")
  })
})

describe("layout", () => {
  it("shows the mark from the app, and starts the plain text with the title", async () => {
    const email = await labelsReadyEmail({ appUrl, shipmentId: "1", reference: "TEST-UNIC-1", shipment: 2, to })
    expect(email.html).toContain(`src="${appUrl}/email/mark.png"`)
    expect(email.text.startsWith("Labels ready for TEST-UNIC-1, shipment 2\n")).toBe(true)
  })
})
