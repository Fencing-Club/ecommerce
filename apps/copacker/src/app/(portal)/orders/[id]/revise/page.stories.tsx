import type { OrderInput } from "@repo/copacker-orders"
import { http, HttpResponse } from "msw/http"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import { translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ReviserProduct } from "@/components/supplier/order-reviser"
import type { Proposal } from "@/db/schema"
import { orderData, orderItem } from "@/stories/fixtures/orders"
import { reviserProducts } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import PageView from "./page"

const orderId = "5e9b2d71-4b3e-4f5a-8c6d-000000000001"

type Args = {
  order: { revision: number; data: OrderInput }
  // The latest proposal on the order, if any.
  latest: { status: "pending" | "approved" | "declined" | "withdrawn"; data: Proposal } | null
  // The buyer's name, or null when it can't be found.
  customer: string | null
  // The products the supplier can add, priced from the customer's catalog.
  products: ReviserProduct[]
}

// The supplier's Edit order page (page.tsx) for a sent purchase order, from what the database would return.
async function ReviseOrderPage({ order, latest, customer, products }: Args) {
  const t = await translateStory("orders.revise")
  const id = orderId
  const { data } = order
  // A pending proposal is edited from where the supplier left it: its lines, terms, ready date and note.
  const proposal = latest?.status === "pending" ? latest.data : null
  const original = (itemId: string | undefined) => data.items.find((item) => item.id === itemId)
  const items = (
    proposal?.lines ??
    data.items.map((item) => ({
      itemId: item.id,
      supplierSku: item.supplierSku,
      title: item.name,
      pieces: item.pieces,
      unitPrice: item.unitPrice
    }))
  ).map((line) => {
    const item = original(line.itemId)
    return {
      itemId: line.itemId,
      name: item?.name ?? line.title,
      variant: item?.variant && item.variant !== "Default Title" ? item.variant : "",
      supplierSku: line.supplierSku,
      piecesPerSet: item?.piecesPerSet ?? 1,
      pieces: line.pieces,
      unitPrice: line.unitPrice,
      original: item ? { pieces: item.pieces, unitPrice: item.unitPrice } : undefined
    }
  })
  // Removed lines stay listed, so the supplier can put them back.
  const removed = proposal
    ? data.items
        .filter((item) => !proposal.lines.some((line) => line.itemId === item.id))
        .map((item) => ({
          itemId: item.id,
          name: item.name,
          variant: item.variant !== "Default Title" ? item.variant : "",
          supplierSku: item.supplierSku,
          piecesPerSet: item.piecesPerSet,
          pieces: item.pieces,
          unitPrice: item.unitPrice,
          original: { pieces: item.pieces, unitPrice: item.unitPrice },
          removed: true
        }))
    : []
  const current = { paymentTerms: data.paymentTerms, readyDate: data.readyDate ?? null }
  return (
    <PageView
      page={{
        orderId: id,
        revision: order.revision,
        reference: data.reference,
        customer: customer ?? t("yourCustomer"),
        currency: data.currency,
        items: [...items, ...removed],
        subtotal: data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0),
        current: current,
        terms: proposal
          ? { paymentTerms: proposal.paymentTerms, readyDate: proposal.readyDate, note: proposal.note }
          : { ...current, note: "" },
        proposalPending: proposal !== null,
        products: products
      }}
    />
  )
}

// A sent purchase order: a tote and a Default Title apron that comes in sixes.
const tote = orderItem({ pieces: 240, unitPrice: 425 })
const apron = orderItem({ name: "Linen apron", variant: "Default Title", piecesPerSet: 6, pieces: 120, unitPrice: 890 })
const order = { revision: 2, data: orderData({ reference: "PO-2051", items: [tote, apron] }) }

const proposed = fn()

const meta = preview.meta({
  title: "Pages/Purchase orders/Propose changes",
  ...pageStory(`/orders/${orderId}/revise`, ReviseOrderPage, "supplier"),
  args: { order, latest: null, customer: "Harbor Goods", products: reviserProducts },
  beforeEach: ({ msw }) => {
    proposed.mockClear()
    msw.use(
      http.post("/api/orders/:id/proposal", async ({ request }) => {
        proposed(await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Edit order" })).toBeVisible()
    const trail = within(canvas.getByRole("navigation", { name: "Breadcrumb" }))
    await expect(trail.getByRole("link", { name: "PO-2051" })).toHaveAttribute("href", `/orders/${orderId}`)
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag, Natural" })).toHaveValue(240)
    // A Default Title variant reads as the product alone.
    const quantity = canvas.getByRole("spinbutton", { name: "Quantity of Linen apron" })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, "126")
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    await waitFor(() => expect(proposed).toHaveBeenCalledOnce())
    await expect(proposed.mock.calls[0]![0]).toMatchObject({
      revision: 2,
      proposal: {
        lines: [
          { itemId: tote.id, pieces: 240, unitPrice: 425 },
          { itemId: apron.id, pieces: 126, unitPrice: 890 }
        ],
        paymentTerms: "Net 30",
        readyDate: null
      }
    })
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}` }))
  }
})

// Changes waiting on the customer: the edit starts from them, with the removed apron listed to put back.
export const PendingChanges = meta.story({
  args: {
    latest: {
      status: "pending",
      data: {
        lines: [
          { itemId: tote.id, supplierSku: tote.supplierSku, title: tote.name, pieces: 300, unitPrice: 410 },
          { supplierSku: "LM-BASKET", title: "Market basket", pieces: 24, unitPrice: 1450 }
        ],
        paymentTerms: "Net 15",
        readyDate: "2026-11-02",
        note: "Baskets are back in stock."
      }
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Awaiting approval")).toBeVisible()
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag, Natural" })).toHaveValue(300)
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Market basket" })).toHaveValue(24)
    await expect(canvas.getByRole("button", { name: "Restore Linen apron" })).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Note to Harbor Goods" })).toHaveValue(
      "Baskets are back in stock."
    )
  }
})

// A declined proposal is done with: the edit starts from the purchase order.
export const AfterDecline = meta.story({
  args: {
    latest: {
      status: "declined",
      data: { lines: [], paymentTerms: "Net 15", readyDate: null, note: "" }
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Awaiting approval")).toBeNull()
    await expect(canvas.getByRole("combobox", { name: "Payment terms" })).toHaveTextContent("Net 30")
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Linen apron" })).toHaveValue(120)
  }
})

// Without the buyer's name, the note is to "your customer".
export const UnknownCustomer = meta.story({
  args: { customer: null },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove Linen apron" }))
    await expect(canvas.getByRole("textbox", { name: "Note to your customer" })).toBeVisible()
  }
})
