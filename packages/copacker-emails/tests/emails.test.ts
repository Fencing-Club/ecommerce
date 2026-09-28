import { describe, expect, it } from "vitest"
import CustomerDataRequest from "../src/emails/customer-data-request"
import Invitation from "../src/emails/invitation"
import LabelsReady from "../src/emails/labels-ready"
import PasswordReset from "../src/emails/password-reset"
import PurchaseOrder from "../src/emails/purchase-order"
import {
  customerDataRequestEmail,
  invitationEmail,
  labelsReadyEmail,
  passwordResetEmail,
  purchaseOrderEmail,
  type Email
} from "../src/index"

const appUrl = "https://copacker.example"

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
  const { copy } = Invitation.PreviewProps

  it.each(["supplier", "team", "forwarder"] as const)(
    "invites a %s, with what comes next and a button to accept",
    async (kind) => {
      const email = await invitationEmail({ ...Invitation.PreviewProps, appUrl, kind, token: "token-1" })
      expect(email.subject).toBe(copy.subject)
      expectInBoth(
        email,
        copy.eyebrow,
        copy.heading,
        copy.lead,
        ...copy.steps,
        copy.action,
        `${appUrl}/invite?token=token-1&kind=${kind}`,
        copy.note,
        copy.reason
      )
    }
  )

  it("writes the link out under the button, but only once in the plain text", async () => {
    const email = await invitationEmail({ ...Invitation.PreviewProps, appUrl, token: "token-1" })
    const link = `${appUrl}/invite?token=token-1&kind=supplier`
    expect(email.html).toContain(copy.pasteLink)
    expect(email.text.split(link)).toHaveLength(2)
    expect(email.text).not.toContain(copy.pasteLink)
  })
})

describe("purchase order", () => {
  const item = (quantity: number, name: string, amount: string) => ({ quantity, name, detail: "#5, UF-9035", amount })
  const order = {
    ...PurchaseOrder.PreviewProps,
    appUrl,
    orderId: "5b0e8d52-7c0f-4f4e-9d4a-3f1f5f0b8c11",
    items: [item(14, "Unic Epee Arrow Blade", "$1,120.00"), item(10, "Unic Foil Blade", "$785.00")],
    total: "$1,905.00",
    copy: { ...PurchaseOrder.PreviewProps.copy, more: undefined }
  }
  const { copy } = order

  it("says who sent it, what it's for and that the PDF is attached", async () => {
    const email = await purchaseOrderEmail(order)
    expect(email.subject).toBe(copy.subject)
    expectInBoth(
      email,
      copy.eyebrow,
      copy.heading,
      copy.lead,
      "Dec 1, 2026",
      "Fencing Club warehouse",
      "Net 30",
      "$1,905.00",
      "Unic Epee Arrow Blade",
      "#5, UF-9035",
      "$1,120.00",
      copy.note,
      copy.action,
      `${appUrl}/orders/${order.orderId}`,
      copy.reason
    )
    // The plain text lines each label up with its value.
    expect(email.text).toMatch(/Required by +Dec 1, 2026\n/)
    expect(email.text).toMatch(/Total +\$1,905\.00\n/)
    expect(email.text).not.toContain(copy.labels.revision)
  })

  it("leaves out what the buyer didn't set", async () => {
    const email = await purchaseOrderEmail({ ...order, dueDate: undefined, shipTo: undefined, paymentTerms: undefined })
    expectInBoth(email, copy.note)
    for (const label of ["Required by", "Ship to", "Payment terms", "Revision"]) {
      expect(email.text).not.toContain(label)
    }
  })

  it("lists the first four lines and says how many more there are", async () => {
    const items = Array.from({ length: 6 }, (_, index) => item(1, `Blade ${index + 1}`, "$10.00"))
    const more = "And 2 more products in the purchase order"
    const email = await purchaseOrderEmail({ ...order, items, copy: { ...copy, more } })
    expectInBoth(email, "Blade 4", more)
    expect(email.text).not.toContain("Blade 5")
  })

  it("numbers a revision, and writes dates in the reader's language", async () => {
    const email = await purchaseOrderEmail({ ...order, revision: 2, lang: "de" })
    expect(email.text).toMatch(/Revision +2\n/)
    expect(email.text).toContain("1. Dez. 2026")
  })
})

describe("labels ready", () => {
  const shipment = { ...LabelsReady.PreviewProps, appUrl, shipmentId: "0c5a9f3e-2b1d-4c8e-a7f6-9d2e4b6c8a10" }
  const { copy } = shipment

  it("lists the shipment's cartons and what to do next", async () => {
    const email = await labelsReadyEmail({ ...shipment, amazonShipments: ["STAR-1", "STAR-2"] })
    expect(email.subject).toBe(copy.subject)
    expectInBoth(
      email,
      copy.heading,
      copy.lead,
      "Amazon AWD US",
      "Nov 20, 2026",
      "STAR-1, STAR-2",
      ...copy.steps,
      copy.action,
      `${appUrl}/shipments/${shipment.shipmentId}`,
      copy.reason
    )
    expect(email.text).toMatch(/Cartons +6\n/)
  })

  it("leaves out what isn't known yet", async () => {
    const email = await labelsReadyEmail({
      ...shipment,
      cartons: undefined,
      destination: undefined,
      readyDate: undefined,
      amazonShipments: undefined
    })
    for (const label of Object.values(copy.labels)) {
      expect(email.text).not.toContain(label)
    }
  })
})

describe("password reset", () => {
  it("links to the reset page and says when the link expires", async () => {
    const { copy } = PasswordReset.PreviewProps
    const link = `${appUrl}/reset-password?token=reset%2Ftoken`
    const email = await passwordResetEmail({ ...PasswordReset.PreviewProps, appUrl, link })
    expect(email.subject).toBe(copy.subject)
    expectInBoth(email, copy.heading, copy.lead, copy.action, link, copy.note, copy.reason)
  })
})

describe("customer data request", () => {
  const request = { ...CustomerDataRequest.PreviewProps, appUrl }
  const { copy } = request

  it("lists the requested orders Copacker holds, one a line", async () => {
    const email = await customerDataRequestEmail(request)
    expect(email.subject).toBe(copy.subject)
    expectInBoth(email, copy.heading, copy.lead, copy.note, copy.ordersIntro, ...request.orders, copy.reason)
    expect(email.text).toMatch(/Request +42\n/)
    expect(email.text).toContain(request.orders.join("\n"))
  })

  it("says when Copacker holds none of the orders", async () => {
    const email = await customerDataRequestEmail({ ...request, orders: [] })
    expect(email.text).toMatch(/Orders Copacker holds +None/)
    expect(email.text).not.toContain(copy.ordersIntro)
  })
})

describe("layout", () => {
  const email = () => labelsReadyEmail({ ...LabelsReady.PreviewProps, appUrl })

  it("shows the mark from the app, and starts the plain text with what kind of email it is and its title", async () => {
    const { copy } = LabelsReady.PreviewProps
    const { html, text } = await email()
    expect(html).toContain(`src="${appUrl}/email/mark.png"`)
    expect(text.startsWith(`${copy.eyebrow}\n\n${copy.heading}\n`)).toBe(true)
  })

  it("names Copacker in the footer without writing out its address", async () => {
    const { text } = await email()
    expect(text).toMatch(/\nCopacker\n\nRestocking, handled\.\n/)
    expect(text).not.toContain(`Copacker ${appUrl}`)
  })

  it("names the language", async () => {
    const { html } = await labelsReadyEmail({ ...LabelsReady.PreviewProps, appUrl, lang: "de" })
    expect(html).toMatch(/<html[^>]* lang="de"/)
  })
})
