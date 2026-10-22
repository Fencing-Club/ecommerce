import { http, HttpResponse } from "msw/http"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { catalogVariants, importedProducts, importId, importProposal } from "@/stories/fixtures/purchase-orders"
import { ImportLines } from "./import-review-lines"

const lines = importProposal.items.map((item, index) => ({ ...item, key: `line-${index}` }))

// The lines of an imported purchase order as the review edits them; the review keeps the edits.
const meta = preview.meta({
  title: "Components/Purchase orders/Import review lines",
  component: ImportLines,
  args: {
    id: importId,
    lines,
    selectedProducts: importedProducts,
    currency: "USD",
    checking: false,
    onEditLine: fn(),
    onChoose: fn(),
    onAddLine: fn(() => "line-new"),
    onRemoveLine: fn(),
    onSourceDetails: fn()
  },
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/imports/:id/catalog", () =>
        HttpResponse.json({ results: [catalogVariants[0]], nextCursor: null, complete: true })
      )
    )
  }
})

function row(canvas: ReturnType<typeof within>, number: number) {
  return within(canvas.getByRole("spinbutton", { name: `Units on line ${number}` }).closest("tr")!)
}

// A matched line shows its product; an unmatched one offers to find it, and says when units × price misses the
// document's line total. Each edit goes to the review.
export const Lines = meta.story({
  play: async ({ canvas, args }) => {
    await expect(row(canvas, 1).getByText("Canvas tote bag")).toBeVisible()
    await expect(row(canvas, 1).getByRole("textbox", { name: "Price per unit on line 1" })).toHaveAccessibleDescription(
      "USD"
    )
    await expect(row(canvas, 2).getByText("No matching product")).toBeVisible()
    await expect(row(canvas, 2).getByText("Units × price is $870, but the line total is $900")).toBeVisible()
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Units on line 2" }), "0")
    await expect(args.onEditLine).toHaveBeenCalledWith(1, expect.any(Function))
    await userEvent.click(row(canvas, 1).getByRole("button", { name: "More for line 1" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Source details" }))
    await expect(args.onSourceDetails).toHaveBeenCalledWith(lines[0], expect.any(HTMLElement))
  }
})

// Finding a product searches the import's catalog from the line's SKU, and choosing one closes the search.
export const FindProduct = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(row(canvas, 2).getByRole("button", { name: "Find product" }))
    const search = canvas.getByRole("searchbox", { name: "Find a product for line 2" })
    await expect(search).toHaveValue("LM-BASKET-L")
    await expect(search).toHaveFocus()
    await userEvent.click(await canvas.findByRole("button", { name: /Waffle towel/ }))
    await expect(args.onChoose).toHaveBeenCalledWith(1, catalogVariants[0])
    await expect(canvas.queryByRole("searchbox")).toBeNull()
  }
})

// A new line opens with an empty search under it.
export const AddLine = meta.story({
  args: {
    lines: [...lines, { ...lines[1]!, key: "line-new", description: "", sourceSku: null, warnings: [] }]
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add line" }))
    await expect(args.onAddLine).toHaveBeenCalledOnce()
    await expect(canvas.getByRole("searchbox", { name: "Find a product for line 3" })).toHaveValue("")
  }
})

// Once saving has been tried, a line's empty cells are marked.
export const Checking = meta.story({
  args: { checking: true, lines: [{ ...lines[0]!, pieces: null, pricePerPiece: null }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("spinbutton", { name: "Units on line 1" })).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByRole("textbox", { name: "Price per unit on line 1" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "Units per pack on line 1" })).toHaveAttribute(
      "aria-invalid",
      "false"
    )
    // The last line can't be removed.
    await userEvent.click(canvas.getByRole("button", { name: "More for line 1" }))
    await waitFor(async () =>
      expect(await screen.findByRole("menuitem", { name: "Remove line" })).toHaveAttribute("aria-disabled", "true")
    )
  }
})
