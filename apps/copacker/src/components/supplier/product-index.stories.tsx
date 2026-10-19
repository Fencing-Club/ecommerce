import { http, HttpResponse } from "msw"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { manyProductRows, productRows } from "@/stories/fixtures/supplier"
import { member } from "@/stories/workspace"
import { ProductIndex } from "./product-index"

// Each archive or restore the list sent.
const statusChanged = fn()

const meta = preview.meta({
  title: "Components/Supplier workspace/Product index",
  component: ProductIndex,
  args: { products: productRows },
  beforeEach: ({ msw }) => {
    statusChanged.mockClear()
    msw.use(
      http.post("/api/supplier-catalog/status", async ({ request }) => {
        statusChanged(await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

const [tote, apron, basket, throwRow] = productRows
const rowOf = (canvas: ReturnType<typeof within>, title: string) =>
  within(canvas.getByRole("link", { name: title }).closest("tr")!)

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /All\s*4/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByRole("tab", { name: /Archived\s*1/ })).toBeVisible()
    const toteRow = rowOf(canvas, "Canvas tote bag")
    await expect(canvas.getByRole("link", { name: "Canvas tote bag" })).toHaveAttribute("href", `/products/${tote!.id}`)
    await expect(toteRow.getByText("2 variants")).toBeVisible()
    await expect(toteRow.getByText("160 in stock")).toBeVisible()
    await expect(toteRow.getByText("for 2 variants")).toBeVisible()
    await expect(toteRow.getByText("$4.25 – $4.50")).toBeVisible()
    await expect(toteRow.getByText("Bags")).toBeVisible()
    // A price per pack names its unit.
    const apronRow = rowOf(canvas, "Linen apron")
    await expect(apronRow.getByText("$53.40 / pack")).toBeVisible()
    await expect(apronRow.getByText("Not tracked")).toBeVisible()
    await expect(apronRow.getByText("LM-APRON")).toBeVisible()
    const basketRow = rowOf(canvas, "Market basket")
    await expect(basketRow.getByText("No price")).toBeVisible()
    await expect(basketRow.getByText("0 in stock")).toHaveClass("text-destructive")
    await expect(rowOf(canvas, "Wool throw").getByText("Several currencies")).toBeVisible()
    // Archived shows in its column; the badge under the title is for phones.
    const [underTitle, inColumn] = rowOf(canvas, "Wool throw").getAllByText("Archived")
    await expect(inColumn).toBeVisible()
    await expect(underTitle).not.toBeVisible()
  }
})

export const Search = meta.story({
  play: async ({ canvas }) => {
    const search = canvas.getByRole("searchbox", { name: "Search products" })
    // By a variant's SKU, the category or the product code.
    await userEvent.type(search, "lm-throw-eu")
    await expect(canvas.getByRole("link", { name: "Wool throw" })).toBeVisible()
    await expect(canvas.getAllByRole("link")).toHaveLength(1)
    await userEvent.clear(search)
    await userEvent.type(search, "kitchen")
    await expect(canvas.getByRole("link", { name: "Linen apron" })).toBeVisible()
    await userEvent.clear(search)
    await userEvent.type(search, "lantern")
    await expect(canvas.getByText("No products found")).toBeVisible()
    await expect(canvas.getByText("Try another search or tab.")).toBeVisible()
  }
})

export const Archive = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select Linen apron" }))
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select Market basket" }))
    await expect(canvas.getByText("2 selected")).toBeVisible()
    await expect(canvas.getByRole("checkbox", { name: "Select all products on this page" })).toHaveAttribute(
      "aria-checked",
      "mixed"
    )
    await userEvent.click(canvas.getByRole("button", { name: "Archive" }))
    await waitFor(() => expect(statusChanged).toHaveBeenCalledWith({ ids: [apron!.id, basket!.id], active: false }))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    await waitFor(() => expect(canvas.queryByText("2 selected")).toBeNull())
  }
})

export const SetActive = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /Archived\s*1/ }))
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products on this page" }))
    await expect(canvas.getByText("1 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Set as active" }))
    await waitFor(() => expect(statusChanged).toHaveBeenCalledWith({ ids: [throwRow!.id], active: true }))
  }
})

export const Unselect = meta.story({
  play: async ({ canvas }) => {
    const all = canvas.getByRole("checkbox", { name: "Select all products on this page" })
    await userEvent.click(all)
    await expect(canvas.getByText("4 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select Canvas tote bag" }))
    await expect(canvas.getByText("3 selected")).toBeVisible()
    await userEvent.click(all)
    await userEvent.click(all)
    await expect(canvas.queryByText(/selected/)).toBeNull()
    // Changing tabs clears what's chosen.
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select Linen apron" }))
    await userEvent.click(canvas.getByRole("tab", { name: /Active\s*3/ }))
    await expect(canvas.queryByText(/selected/)).toBeNull()
  }
})

export const ArchiveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/supplier-catalog/status", () => HttpResponse.json({}, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select Canvas tote bag" }))
    await userEvent.click(canvas.getByRole("button", { name: "Archive" }))
    await expect(await canvas.findByText("Couldn’t save. Try again.")).toBeVisible()
    // The choice stays, to try again.
    await expect(canvas.getByText("1 selected")).toBeVisible()
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

export const ManyProducts = meta.story({
  args: { products: manyProductRows(60) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1–50 of 60")).toBeVisible()
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products on this page" }))
    await expect(canvas.getByText("50 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByRole("link", { name: "Stoneware mug 60" })).toBeVisible()
    // What's chosen on other pages stays chosen.
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products on this page" }))
    await expect(canvas.getByText("60 selected")).toBeVisible()
  }
})

// A member who views products without prices: no choosing, and no prices.
export const ViewOnlyWithoutPrices = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("checkbox")).toBeNull()
    await expect(canvas.queryByRole("columnheader", { name: "Price" })).toBeNull()
    await expect(canvas.queryByText("$4.25 – $4.50")).toBeNull()
    await expect(canvas.getByText("160 in stock")).toBeVisible()
  }
})

export const OnPhone = meta.story({
  globals: { viewport: { value: "iphone12" } },
  play: async ({ canvas }) => {
    // The status column hides, and an archived product says so under its title.
    await expect(canvas.queryByRole("columnheader", { name: "Status" })).toBeNull()
    const [underTitle, inColumn] = rowOf(canvas, "Wool throw").getAllByText("Archived")
    await expect(underTitle).toBeVisible()
    await expect(inColumn).not.toBeVisible()
    await expect(rowOf(canvas, "Canvas tote bag").getByText("$4.25 – $4.50")).toBeVisible()
  }
})

export const Empty = meta.story({
  args: { products: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Add your first product")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Add product" })).toHaveAttribute("href", "/products/new")
  }
})
