import { http, HttpResponse } from "msw/http"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { reviserItems, reviserProducts } from "@/stories/fixtures/supplier"
import { shownDialog, chooseOption } from "@/stories/play"
import { OrderReviser } from "./order-reviser"

// Each proposal the page sent: the order and its body.
const proposed = fn()
const orderId = "5e9b2d71-4b3e-4f5a-8c6d-000000000001"
const current = { paymentTerms: "Net 30", readyDate: null }

const meta = preview.meta({
  title: "Components/Supplier workspace/Order reviser",
  component: OrderReviser,
  args: {
    orderId,
    revision: 2,
    reference: "PO-2051",
    customer: "Harbor Goods",
    currency: "USD",
    items: reviserItems,
    subtotal: 240 * 425 + 120 * 890,
    current,
    terms: { ...current, note: "" },
    proposalPending: false,
    products: reviserProducts
  },
  beforeEach: ({ msw }) => {
    proposed.mockClear()
    msw.use(
      http.post("/api/orders/:id/proposal", async ({ params, request }) => {
        proposed(params.id, await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

const lineOf = (name: string) => within(screen.getByText(name, { selector: "p" }).closest("li")!)
const summary = () => within(screen.getByText("Summary").closest("[data-slot=card]")!)

export const Unchanged = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Edit order" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "PO-2051" })).toHaveAttribute("href", `/orders/${orderId}`)
    await expect(canvas.getByRole("button", { name: "Cancel" })).toHaveAttribute("href", `/orders/${orderId}`)
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag, Natural" })).toHaveValue(240)
    await expect(canvas.getByRole("textbox", { name: "Unit price of Linen apron, Charcoal" })).toHaveValue("8.90")
    await expect(lineOf("Linen apron").getByText("$1,068")).toBeVisible()
    await expect(summary().getAllByText("$2,088")).toHaveLength(2)
    await expect(summary().queryByText("Difference")).toBeNull()
    // Nothing changed: the button saves, and there's no note to send.
    await expect(canvas.queryByRole("textbox", { name: "Note to Harbor Goods" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(canvas.getByRole("alert")).toHaveTextContent("No changes to save")
    await expect(proposed).not.toHaveBeenCalled()
  }
})

export const ChangeQuantityAndPrice = meta.story({
  play: async ({ canvas }) => {
    const quantity = canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag, Natural" })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, "300")
    const price = canvas.getByRole("textbox", { name: "Unit price of Canvas tote bag, Natural" })
    await userEvent.clear(price)
    await userEvent.type(price, "4.10")
    await userEvent.tab()
    await expect(lineOf("Canvas tote bag").getByText("Changed")).toBeVisible()
    await expect(lineOf("Canvas tote bag").getByText("$1,230")).toBeVisible()
    await expect(summary().getByText("$2,298")).toBeVisible()
    await expect(summary().getByText("+$210")).toBeVisible()
    // Changes to products go to the customer, with a note.
    await userEvent.type(canvas.getByRole("textbox", { name: "Note to Harbor Goods" }), "Cotton costs went down.")
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    await waitFor(() => expect(proposed).toHaveBeenCalledOnce())
    await expect(proposed).toHaveBeenCalledWith(orderId, {
      revision: 2,
      proposal: {
        lines: [
          { itemId: "item-tote", supplierSku: "LM-TOTE-NAT", title: "Canvas tote bag", pieces: 300, unitPrice: 410 },
          { itemId: "item-apron", supplierSku: "LM-APRON", title: "Linen apron", pieces: 120, unitPrice: 890 }
        ],
        paymentTerms: "Net 30",
        readyDate: null,
        note: "Cotton costs went down."
      }
    })
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}` }))
  }
})

export const RemoveAndRestore = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove Linen apron, Charcoal" }))
    await expect(lineOf("Linen apron").getByText("Removed")).toBeVisible()
    await expect(canvas.queryByRole("spinbutton", { name: "Quantity of Linen apron, Charcoal" })).toBeNull()
    await expect(summary().getByText("−$1,068")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Restore Linen apron, Charcoal" }))
    await expect(lineOf("Linen apron").queryByText("Removed")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Remove Linen apron, Charcoal" }))
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    await waitFor(() => expect(proposed).toHaveBeenCalledOnce())
    await expect(proposed.mock.calls[0]![1].proposal.lines).toEqual([
      { itemId: "item-tote", supplierSku: "LM-TOTE-NAT", title: "Canvas tote bag", pieces: 240, unitPrice: 425 }
    ])
  }
})

export const AddProduct = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add products" }))
    const dialog = await shownDialog("Add products")
    await expect(dialog.getByText("At Harbor Goods’s prices")).toBeInTheDocument()
    // The tote is on the order already.
    await expect(dialog.queryByText("Canvas tote bag, Natural")).toBeNull()
    await expect(dialog.getByRole("button", { name: /Stoneware mug\s*LM-MUG\s*No price/ })).toBeInTheDocument()
    await userEvent.type(dialog.getByRole("searchbox", { name: "Search products" }), "zzz")
    await expect(dialog.getByText("No products found")).toBeInTheDocument()
    await userEvent.clear(dialog.getByRole("searchbox"))
    await userEvent.type(dialog.getByRole("searchbox"), "lm-basket")
    await userEvent.click(dialog.getByRole("button", { name: /Market basket.*\$14\.50 \/ unit/ }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // It starts at the customer's minimum.
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Market basket" })).toHaveValue(12)
    await expect(lineOf("Market basket").getByText("Added")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    await waitFor(() => expect(proposed).toHaveBeenCalledOnce())
    await expect(proposed.mock.calls[0]![1].proposal.lines[2]).toEqual({
      supplierSku: "LM-BASKET",
      title: "Market basket",
      pieces: 12,
      unitPrice: 1450
    })
  }
})

export const TakeBackAddedProduct = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add products" }))
    await userEvent.click(await screen.findByRole("button", { name: /Stoneware mug/ }))
    await expect(canvas.getByRole("textbox", { name: "Unit price of Stoneware mug" })).toHaveValue("0.00")
    // An added product leaves the list altogether.
    await userEvent.click(canvas.getByRole("button", { name: "Remove Stoneware mug" }))
    await expect(canvas.queryByText("Stoneware mug")).toBeNull()
    await expect(canvas.getByRole("button", { name: "Save" })).toBeVisible()
  }
})

export const ReadyDateOnly = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Updates without approval")).toBeVisible()
    await userEvent.type(canvas.getByLabelText("Ready date"), "2026-11-02")
    // A ready date alone saves straight away, without a note.
    await expect(canvas.queryByRole("textbox", { name: "Note to Harbor Goods" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(proposed).toHaveBeenCalledOnce())
    await expect(proposed.mock.calls[0]![1].proposal).toMatchObject({ readyDate: "2026-11-02", paymentTerms: "Net 30" })
  }
})

export const PaymentTerms = meta.story({
  play: async ({ canvas }) => {
    await chooseOption(canvas.getByRole("combobox", { name: "Payment terms" }), "Payment in advance")
    await expect(canvas.getByRole("button", { name: "Send for approval" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    await waitFor(() =>
      expect(proposed.mock.calls[0]![1].proposal).toMatchObject({ paymentTerms: "Payment in advance" })
    )
  }
})

export const WholeSets = meta.story({
  play: async ({ canvas }) => {
    const quantity = canvas.getByRole("spinbutton", { name: "Quantity of Linen apron, Charcoal" })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, "100")
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    await expect(canvas.getByRole("alert")).toHaveTextContent("Order Linen apron in multiples of 6")
    await expect(proposed).not.toHaveBeenCalled()
  }
})

export const KeepOneProduct = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove Canvas tote bag, Natural" }))
    await userEvent.click(canvas.getByRole("button", { name: "Remove Linen apron, Charcoal" }))
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    await expect(canvas.getByRole("alert")).toHaveTextContent("Keep at least one product")
  }
})

export const SendFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/orders/:id/proposal", () =>
        HttpResponse.json({ error: "The customer changed this purchase order. Reload to see it." }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove Linen apron, Charcoal" }))
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The customer changed this purchase order. Reload to see it."
    )
    await expect(canvas.getByRole("button", { name: "Send for approval" })).toBeEnabled()
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
  }
})

// Editing changes the customer hasn't answered yet: they start as sent, the removed apron included.
export const PendingProposal = meta.story({
  args: {
    items: [
      { ...reviserItems[0]!, pieces: 300 },
      { ...reviserItems[1]!, removed: true },
      {
        name: "Market basket",
        variant: "",
        supplierSku: "LM-BASKET",
        piecesPerSet: 1,
        pieces: 24,
        unitPrice: 1450
      }
    ],
    terms: { paymentTerms: "Net 15", readyDate: "2026-11-02", note: "Baskets are back in stock." },
    proposalPending: true
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Awaiting approval")).toBeVisible()
    await expect(lineOf("Canvas tote bag").getByText("Changed")).toBeVisible()
    await expect(lineOf("Linen apron").getByText("Removed")).toBeVisible()
    await expect(lineOf("Market basket").getByText("Added")).toBeVisible()
    await expect(canvas.getByRole("combobox", { name: "Payment terms" })).toHaveTextContent("Net 15")
    await expect(canvas.getByLabelText("Ready date")).toHaveValue("2026-11-02")
    await expect(canvas.getByRole("textbox", { name: "Note to Harbor Goods" })).toHaveValue(
      "Baskets are back in stock."
    )
    // The basket is on the order already, so it isn't offered again.
    await userEvent.click(canvas.getByRole("button", { name: "Add products" }))
    await expect(await screen.findByRole("button", { name: /Stoneware mug/ })).toBeInTheDocument()
    await expect(screen.queryByRole("button", { name: /Market basket/ })).toBeNull()
  }
})

export const NothingToAdd = meta.story({
  args: { products: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add products" })).toBeDisabled()
  }
})
