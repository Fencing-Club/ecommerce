import { describe, expect, it } from "vitest"
import {
  customerDataRequestEmail,
  invitationEmail,
  labelsReadyEmail,
  passwordResetEmail,
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
    ["supplier", "Join as their supplier and get their purchase orders there.", "Set up your supplier workspace"],
    ["team", "Join their workspace.", "Start working in Fencing Club"],
    [
      "forwarder",
      "Join as their freight forwarder and share your warehouse addresses with them.",
      "Add your warehouse addresses"
    ]
  ] as const)("invites a %s, with what comes next and a button to accept", async (kind, joining, step) => {
    const email = await invitationEmail({ appUrl, kind, from: "Fencing Club", to, token: "token-1" })
    expect(email.subject).toBe("Fencing Club invited you to Copacker")
    expectInBoth(
      email,
      email.subject,
      joining,
      step,
      "Accept invitation",
      `${appUrl}/invite?token=token-1&kind=${kind}`,
      `It’s for ${to} and expires in 7 days.`,
      `Fencing Club invited ${to} to Copacker.`
    )
  })

  it("writes the link out under the button, but only once in the plain text", async () => {
    const email = await invitationEmail({ appUrl, kind: "supplier", from: "Fencing Club", to, token: "token-1" })
    const link = `${appUrl}/invite?token=token-1&kind=supplier`
    expect(email.html).toContain("Or paste this link into your browser:")
    expect(email.text.split(link)).toHaveLength(2)
    expect(email.text).not.toContain("Or paste this link")
  })
})

describe("purchase order", () => {
  const item = (quantity: number, name: string, amount: string) => ({ quantity, name, detail: "#5, UF-9035", amount })
  const order = {
    appUrl,
    orderId: "5b0e8d52-7c0f-4f4e-9d4a-3f1f5f0b8c11",
    reference: "TEST-UNIC-1",
    buyer: "Fencing Club",
    revision: 1,
    items: [item(14, "Unic Epee Arrow Blade", "$1,120.00"), item(10, "Unic Foil Blade", "$785.00")],
    units: 24,
    total: "$1,905.00",
    to
  }

  it("says who sent it, what it's for and that the PDF is attached", async () => {
    const email = await purchaseOrderEmail({
      ...order,
      dueDate: "2026-12-01",
      shipTo: "Fencing Club warehouse",
      paymentTerms: "Net 30"
    })
    expect(email.subject).toBe("Purchase order TEST-UNIC-1 from Fencing Club")
    expectInBoth(
      email,
      "New purchase order",
      "TEST-UNIC-1 from Fencing Club",
      "Fencing Club sent you a purchase order for 24 units of 2 products.",
      "Dec 1, 2026",
      "Fencing Club warehouse",
      "Net 30",
      "$1,905.00",
      "Unic Epee Arrow Blade",
      "#5, UF-9035",
      "$1,120.00",
      "The purchase order PDF is attached.",
      "Open purchase order",
      `${appUrl}/orders/${order.orderId}`
    )
    // The plain text lines each label up with its value.
    expect(email.text).toMatch(/Required by +Dec 1, 2026\n/)
    expect(email.text).toMatch(/Total +\$1,905\.00\n/)
    expect(email.text).not.toContain("pieces")
  })

  it("leaves out what the buyer didn't set", async () => {
    const email = await purchaseOrderEmail(order)
    expectInBoth(email, "The purchase order PDF is attached.")
    for (const label of ["Required by", "Ship to", "Payment terms", "Revision"]) {
      expect(email.text).not.toContain(label)
    }
  })

  it("lists the first four lines and counts the rest", async () => {
    const items = Array.from({ length: 6 }, (_, index) => item(1, `Blade ${index + 1}`, "$10.00"))
    const email = await purchaseOrderEmail({ ...order, items, units: 6, total: "$60.00" })
    expectInBoth(email, "Blade 4", "And 2 more products in the purchase order")
    expect(email.text).not.toContain("Blade 5")
  })

  it("says a revision replaces the one the supplier had", async () => {
    const email = await purchaseOrderEmail({ ...order, revision: 2 })
    expectInBoth(email, "Revised purchase order", "Fencing Club changed this purchase order.")
    expect(email.text).toMatch(/Revision +2\n/)
  })
})

describe("labels ready", () => {
  const shipment = {
    appUrl,
    shipmentId: "0c5a9f3e-2b1d-4c8e-a7f6-9d2e4b6c8a10",
    reference: "TEST-UNIC-1",
    buyer: "Fencing Club",
    to
  }

  it("names the shipment by its number, with its cartons and what to do next", async () => {
    const email = await labelsReadyEmail({
      ...shipment,
      shipment: 1,
      cartons: 6,
      destination: "Amazon AWD US",
      readyDate: "2026-11-20",
      amazonShipments: ["STAR-1", "STAR-2"]
    })
    expect(email.subject).toBe("Labels ready for TEST-UNIC-1, shipment 1")
    expectInBoth(
      email,
      "Labels are ready for TEST-UNIC-1, shipment 1",
      "Fencing Club released the shipment, so it’s ready to label and send.",
      "Amazon AWD US",
      "Nov 20, 2026",
      "STAR-1, STAR-2",
      "Print the labels at actual size (100%)",
      "Open shipment",
      `${appUrl}/shipments/${shipment.shipmentId}`
    )
    expect(email.text).toMatch(/Cartons +6\n/)
  })

  it("names only the purchase order when the shipment's number isn't known", async () => {
    const email = await labelsReadyEmail(shipment)
    expect(email.subject).toBe("Labels ready for TEST-UNIC-1")
    expectInBoth(email, "Labels are ready for TEST-UNIC-1")
    expect(email.text).not.toContain("Cartons")
  })
})

describe("password reset", () => {
  it("links to the reset page and says when the link expires", async () => {
    const link = `${appUrl}/reset-password?token=reset%2Ftoken`
    const email = await passwordResetEmail({ appUrl, link, expiresIn: "15 minutes", to: "ann@example.net" })
    expect(email.subject).toBe("Reset your Copacker password")
    expectInBoth(
      email,
      "Reset your password",
      "Choose a new password for ann@example.net.",
      "Choose a new password",
      link,
      "The link expires in 15 minutes."
    )
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
      "Shopify sent Copacker a customer data request.",
      "Copacker doesn’t store customers’ names, email addresses, phone numbers, or mailing addresses.",
      "Only the order details Copacker uses to plan restocks:",
      ...orders
    )
    expect(email.text).toMatch(/Request +42\n/)
    expect(email.text).toContain(orders.join("\n"))
  })

  it("says when Copacker holds none of the orders", async () => {
    const email = await customerDataRequestEmail({ ...request, orders: [] })
    expect(email.text).toMatch(/Orders Copacker holds +None/)
    expect(email.text).not.toContain("Only the order details")
  })
})

describe("layout", () => {
  it("shows the mark from the app, and starts the plain text with what kind of email it is and its title", async () => {
    const email = await labelsReadyEmail({
      appUrl,
      shipmentId: "1",
      reference: "TEST-UNIC-1",
      buyer: "Fencing Club",
      to
    })
    expect(email.html).toContain(`src="${appUrl}/email/mark.png"`)
    expect(email.text.startsWith("Ready to ship\n\nLabels are ready for TEST-UNIC-1\n")).toBe(true)
  })

  it("names Copacker in the footer without writing out its address", async () => {
    const email = await labelsReadyEmail({
      appUrl,
      shipmentId: "1",
      reference: "TEST-UNIC-1",
      buyer: "Fencing Club",
      to
    })
    expect(email.text).toMatch(/\nCopacker\n\nRestocking, handled\.\n/)
    expect(email.text).not.toContain(`Copacker ${appUrl}`)
  })
})
