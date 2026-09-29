import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { supplierId } from "@/stories/fixtures/orders"
import {
  builderSuppliers,
  catalogProducts,
  importedProducts,
  importId,
  importProposal,
  orderId
} from "@/stories/fixtures/purchase-orders"
import { ImportReview } from "./import-review"

const searched = fn()
const corrected = fn()
const saved = fn()
// A catalog product the search finds for the unmatched basket.
const market = {
  ...catalogProducts[2]!,
  id: "gid://shopify/ProductVariant/300031",
  title: "Large",
  sku: "BASKET-L",
  product: { id: "gid://shopify/Product/30003", title: "Market basket" },
  supplierSku: { value: "LM-BASKET-L" }
}

const meta = preview.meta({
  component: ImportReview,
  args: {
    id: importId,
    filename: "lotus-po-118.pdf",
    initialRevision: 3,
    initialProposal: importProposal,
    initialSelectedProducts: importedProducts,
    suppliers: builderSuppliers
  },
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/imports/:id", () => HttpResponse.json({ status: "review", orderId: null })),
      http.patch("/api/imports/:id", async ({ request }) => {
        corrected(await request.json())
        return HttpResponse.json({ revision: 4 })
      }),
      http.post("/api/imports/:id/save", async ({ request }) => {
        saved(await request.json())
        return HttpResponse.json({ id: orderId, redirect: `/orders/${orderId}` })
      }),
      http.get("/api/imports/:id/catalog", ({ request }) => {
        const url = new URL(request.url)
        searched(Object.fromEntries(url.searchParams))
        return HttpResponse.json({
          results: url.searchParams.get("cursor") ? [catalogProducts[1]] : [market],
          nextCursor: url.searchParams.get("cursor") ? null : "page-2",
          complete: false
        })
      })
    )
  }
})

type Canvas = ReturnType<typeof within>

function line(canvas: Canvas, number: number) {
  return within(canvas.getByRole("spinbutton", { name: `Units on line ${number}` }).closest("tr")!)
}

// The details the draft needs before it saves: the supplier and the date it's required by.
async function fillDetails(canvas: Canvas) {
  await userEvent.click(canvas.getByRole("combobox", { name: "Supplier" }))
  await userEvent.click(await screen.findByRole("option", { name: "Lotus Manufacturing" }))
  await userEvent.type(canvas.getByLabelText(/Required by/), "2026-11-01")
}

// What the reader found: a matched line, one it couldn't match, the document's notes, and totals that add up.
export const Review = meta.story({
  play: async ({ canvas }) => {
    const title = canvas.getByRole("heading", { name: "lotus-po-118.pdf" })
    await expect(title).toBeVisible()
    // The file name reads left to right in every language.
    await expect(within(title).getByText("lotus-po-118.pdf")).toHaveAttribute("dir", "ltr")
    await expect(canvas.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/orders/import")
    await expect(canvas.getByRole("button", { name: "View PDF" })).toHaveAttribute(
      "href",
      `/api/imports/${importId}/source`
    )
    await expect(canvas.getByText("The document has no ship-to address")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: /Reference number/ })).toHaveValue("LM-2026-118")

    const first = line(canvas, 1)
    await expect(first.getByText("Canvas tote bag")).toBeVisible()
    await expect(first.getByText("Natural")).toBeVisible()
    await expect(first.getByText("TOTE-001")).toBeVisible()
    await expect(first.getByText("SKU LM-TOTE-001, 240 pcs at 4.25, page 1")).toBeVisible()
    await expect(first.getByText("SKU matches the supplier SKU")).toBeVisible()

    const second = line(canvas, 2)
    await expect(second.getByText("No matching product")).toBeVisible()
    await expect(second.getByText("Quantity is hard to read")).toBeVisible()
    // Units × price doesn't make the document's line total.
    await expect(second.getByText("Units × price is $870.00, but the line total is $900.00")).toBeVisible()

    await expect(canvas.getByText("$1,890.00")).toBeVisible()
    await expect(canvas.getByText("$85.00")).toBeVisible()
    await expect(canvas.getByText("$1,975.00")).toBeVisible()
    await expect(canvas.queryByText(/the document total/)).toBeNull()

    // Correcting the price clears the mismatch; the totals move with it.
    const price = canvas.getByRole("textbox", { name: "Price per unit on line 2" })
    await userEvent.clear(price)
    await userEvent.type(price, "15")
    await expect(second.queryByText(/but the line total is/)).toBeNull()
    await expect(canvas.getByText("$30.00 over the document total")).toBeVisible()
  }
})

// Saving checks the import is still in review, saves the corrections, then creates the draft purchase order.
export const SaveDraft = meta.story({
  play: async ({ canvas }) => {
    // The review holds the save until the required details are in, with its own messages, and focuses the first.
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    const supplier = canvas.getByRole("combobox", { name: "Supplier" })
    await waitFor(() => expect(supplier).toHaveFocus())
    await expect(supplier).toHaveAttribute("aria-invalid", "true")
    await expect(supplier).toHaveAccessibleDescription("Choose a supplier")
    const requiredBy = canvas.getByLabelText(/Required by/)
    await expect(requiredBy).toHaveAttribute("aria-invalid", "true")
    await expect(requiredBy).toHaveAccessibleDescription("Fill in this field")
    await expect(canvas.getByRole("textbox", { name: /Reference number/ })).toHaveAttribute("aria-invalid", "false")
    await expect(saved).not.toHaveBeenCalled()

    await fillDetails(canvas)
    await expect(supplier).toHaveAttribute("aria-invalid", "false")
    await expect(canvas.queryByText("Fill in this field")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith(`/orders/${orderId}`))
    await expect(corrected).toHaveBeenCalledWith({ revision: 3, proposal: importProposal })
    await expect(saved).toHaveBeenCalledWith({
      revision: 4,
      supplierId,
      reference: "LM-2026-118",
      dueDate: "2026-11-01",
      reviewed: true,
      destination: "amazon"
    })
  }
})

// A draft someone already saved from this import opens instead.
export const AlreadySaved = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/imports/:id", () => HttpResponse.json({ status: "saved", orderId })))
  },
  play: async ({ canvas }) => {
    await fillDetails(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith(`/orders/${orderId}`))
    await expect(corrected).not.toHaveBeenCalled()
  }
})

export const SaveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.patch("/api/imports/:id", () =>
        HttpResponse.json({ error: "Someone else changed this import. Reload it." }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    await fillDetails(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await canvas.findByText("Someone else changed this import. Reload it.")).toBeVisible()
    await expect(saved).not.toHaveBeenCalled()
  }
})

// Finding the product for a line the reader couldn't match: the search starts from its SKU and pages through the
// catalog.
export const FindProduct = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(line(canvas, 2).getByRole("button", { name: "Find product" }))
    const search = canvas.getByRole("textbox", { name: "Find a product for line 2" })
    await expect(search).toHaveValue("LM-BASKET-L")
    await expect(search).toHaveFocus()
    await waitFor(() => expect(searched).toHaveBeenCalledWith({ q: "LM-BASKET-L" }))
    await expect(await canvas.findByText("Large, BASKET-L, Supplier SKU LM-BASKET-L")).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "Search more" }))
    await waitFor(() => expect(searched).toHaveBeenCalledWith({ q: "LM-BASKET-L", cursor: "page-2" }))
    await expect(await canvas.findByText("Waffle towel")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /Waffle towel/ }))

    const second = line(canvas, 2)
    await expect(second.getByText("Waffle towel")).toBeVisible()
    await expect(second.getByText("Selected during review")).toBeVisible()
    await expect(canvas.queryByRole("textbox", { name: "Find a product for line 2" })).toBeNull()
    // The menu now offers to change it.
    await userEvent.click(second.getByRole("button", { name: "More for line 2" }))
    await expect(await screen.findByRole("menuitem", { name: "Change product" })).toBeInTheDocument()
  }
})

export const NoMatches = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/imports/:id/catalog", ({ request }) =>
        HttpResponse.json({
          results: [],
          nextCursor: null,
          complete: new URL(request.url).searchParams.get("q") === "apron"
        })
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(line(canvas, 2).getByRole("button", { name: "Find product" }))
    await expect(await canvas.findByText("No matches yet")).toBeVisible()
    const search = canvas.getByRole("textbox", { name: "Find a product for line 2" })
    await userEvent.clear(search)
    // Enter searches rather than saving the review.
    await userEvent.type(search, "apron{Enter}")
    await expect(await canvas.findByText("No matches")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Close search" }))
    await expect(canvas.queryByRole("textbox", { name: "Find a product for line 2" })).toBeNull()
  }
})

// A line added during review needs a product before the draft saves; the last line can't be removed.
export const AddAndRemoveLines = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add line" }))
    await expect(canvas.getByRole("textbox", { name: "Find a product for line 3" })).toHaveValue("")
    await expect(line(canvas, 3).getByText("Added during review")).toBeVisible()
    await fillDetails(canvas)
    // Its empty cells are marked, the first focused, until they're filled in.
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    const units = canvas.getByRole("spinbutton", { name: "Units on line 3" })
    await waitFor(() => expect(units).toHaveFocus())
    await expect(units).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByRole("textbox", { name: "Price per unit on line 3" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "Units on line 1" })).toHaveAttribute("aria-invalid", "false")
    await expect(saved).not.toHaveBeenCalled()
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Units on line 3" }), "12")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Units per pack on line 3" }), "1")
    await userEvent.type(canvas.getByRole("textbox", { name: "Price per unit on line 3" }), "2.50")
    await expect(units).toHaveAttribute("aria-invalid", "false")
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Choose a product for line 3")
    await expect(corrected).not.toHaveBeenCalled()

    for (const number of [3, 2]) {
      await userEvent.click(canvas.getByRole("button", { name: `More for line ${number}` }))
      await userEvent.click(await screen.findByRole("menuitem", { name: "Remove line" }))
      await waitFor(() => expect(canvas.queryByRole("spinbutton", { name: `Units on line ${number}` })).toBeNull())
    }
    await userEvent.click(canvas.getByRole("button", { name: "More for line 1" }))
    await expect(await screen.findByRole("menuitem", { name: "Remove line" })).toHaveAttribute("aria-disabled", "true")
  }
})

// Charges: a discount is a negative amount, and the total is checked against the document's.
export const Charges = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add charge" }))
    // Saving marks the new charge's empty description and amount.
    await fillDetails(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Charge 2" })).toHaveFocus())
    await expect(canvas.getByRole("textbox", { name: "Amount of charge 2" })).toHaveAttribute("aria-invalid", "true")
    await expect(corrected).not.toHaveBeenCalled()
    await userEvent.type(canvas.getByRole("textbox", { name: "Charge 2" }), "Early payment discount")
    await userEvent.type(canvas.getByRole("textbox", { name: "Amount of charge 2" }), "-20")
    await expect(canvas.getByRole("textbox", { name: "Amount of charge 2" })).toHaveAttribute("aria-invalid", "false")
    await expect(canvas.getByText("$65.00")).toBeVisible()
    await expect(canvas.getByText("$1,955.00")).toBeVisible()
    await expect(canvas.getByText("$20.00 under the document total")).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "Remove charge 1" }))
    await expect(canvas.getByText("-$20.00")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Charge 1" })).toHaveValue("Early payment discount")

    // A charge without an amount leaves the totals open.
    await userEvent.clear(canvas.getByRole("textbox", { name: "Amount of charge 1" }))
    await expect(canvas.getAllByText("—")).toHaveLength(3)
  }
})

// Without a currency the amounts read as plain numbers, and the totals wait for one.
export const NoCurrency = meta.story({
  args: { initialProposal: { ...importProposal, currency: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Units × price is 870.00, but the line total is 900.00")).toBeVisible()
    await expect(canvas.getAllByText("—")).toHaveLength(3)
    await userEvent.click(canvas.getByRole("combobox", { name: "Currency" }))
    await userEvent.click(await screen.findByRole("option", { name: "Euro (EUR €)" }))
    await expect(await canvas.findByText("€1,975.00")).toBeVisible()
  }
})
