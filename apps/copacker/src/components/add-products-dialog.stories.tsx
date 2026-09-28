import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { catalogProducts, productHandlers, shownDialog } from "@/stories/fixtures/purchase-orders"
import { AddProductsDialog } from "./add-products-dialog"

const requests = fn()
const sand = catalogProducts[0]!
const napkins = catalogProducts[2]!

const meta = preview.meta({
  component: AddProductsDialog,
  args: {
    added: new Set<string>(),
    stockAt: { locationIds: ["amazon:fba", "amazon:awd"], label: "At Amazon" },
    onAdd: fn()
  },
  beforeEach: ({ msw }) => {
    msw.use(...productHandlers(requests))
  }
})

async function open(canvas: ReturnType<typeof within>) {
  await userEvent.click(canvas.getByRole("button", { name: "Search products to add" }))
  return shownDialog("Add products")
}

// Stock at the destination sums its locations; a product with one unnamed variation is chosen on its own row.
export const AddProducts = meta.story({
  play: async ({ args, canvas }) => {
    const dialog = await open(canvas)
    await expect(await dialog.findByText("Waffle towel")).toBeVisible()
    await expect(dialog.getByRole("columnheader", { name: "At Amazon" })).toBeVisible()
    const slate = dialog.getByText("Slate").closest("tr")!
    await expect(
      within(slate)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["Slate", "15", "15"])
    const napkinRow = dialog.getByText("Linen napkin set").closest("tr")!
    await expect(
      within(napkinRow)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["Linen napkin set", "0", "—"])

    const add = dialog.getByRole("button", { name: "Add to purchase order" })
    await expect(add).toBeDisabled()
    await userEvent.click(dialog.getByRole("checkbox", { name: /^Select Waffle towel Sand/ }))
    await userEvent.click(dialog.getByRole("checkbox", { name: /^Select all of Linen napkin set/ }))
    await expect(dialog.getByText("2 variants selected")).toBeVisible()
    await userEvent.click(add)
    await waitFor(() => expect(args.onAdd).toHaveBeenCalledWith([sand, napkins]))
    await expect(requests).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/api/catalog",
        search: `?ids=${encodeURIComponent(`${sand.id},${napkins.id}`)}`
      })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

export const Search = meta.story({
  play: async ({ canvas }) => {
    const dialog = await open(canvas)
    await dialog.findByText("Waffle towel")
    await userEvent.type(dialog.getByRole("textbox", { name: "Search products" }), "napkin")
    await waitFor(() => expect(dialog.queryByText("Waffle towel")).toBeNull())
    await expect(dialog.getByText("Linen napkin set")).toBeVisible()
    await expect(requests).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: "/api/inventory/products", search: "?pageSize=50&q=napkin" })
    )
  }
})

// Variations already on the purchase order are checked and can't be chosen again.
export const AlreadyAdded = meta.story({
  args: { added: new Set([sand.id]) },
  play: async ({ canvas }) => {
    const dialog = await open(canvas)
    const already = await dialog.findByRole("checkbox", { name: /^Select Waffle towel Sand/ })
    await expect(already).toBeChecked()
    await expect(already).toHaveAttribute("aria-disabled", "true")
    await expect(dialog.getByText("Already on the purchase order")).toBeVisible()
    await userEvent.click(dialog.getByRole("checkbox", { name: /^Select all of Waffle towel/ }))
    await expect(dialog.getByText("1 variant selected")).toBeVisible()
    await expect(dialog.getByRole("checkbox", { name: /^Select Waffle towel Slate/ })).toBeChecked()
    // Closing forgets the choice.
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    const again = await open(canvas)
    await expect(await again.findByText("0 variants selected")).toBeVisible()
  }
})

// A purchase order to an address without a Shopify location has no stock to show there.
export const NoLocation = meta.story({
  args: { stockAt: { locationIds: null, label: "At location" } },
  play: async ({ canvas }) => {
    const dialog = await open(canvas)
    const slate = (await dialog.findByText("Slate")).closest("tr")!
    await expect(
      within(slate)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["Slate", "—", "15"])
  }
})

export const NoMatches = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/inventory/products", () => HttpResponse.json({ products: [] })))
  },
  play: async ({ canvas }) => {
    const dialog = await open(canvas)
    await expect(await dialog.findByText("No products match.")).toBeVisible()
  }
})

export const LoadFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/inventory/products", () => HttpResponse.json({}, { status: 500 })))
  },
  play: async ({ canvas }) => {
    const dialog = await open(canvas)
    await expect(await dialog.findByText("Couldn’t load your products. Try again.")).toBeVisible()
  }
})

export const AddFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/catalog", () => HttpResponse.json({}, { status: 502 })))
  },
  play: async ({ args, canvas }) => {
    const dialog = await open(canvas)
    await userEvent.click(await dialog.findByRole("checkbox", { name: /^Select Waffle towel Slate/ }))
    await userEvent.click(dialog.getByRole("button", { name: "Add to purchase order" }))
    await expect(await dialog.findByText("Couldn’t add those products. Try again.")).toBeVisible()
    await expect(args.onAdd).not.toHaveBeenCalled()
    await expect(dialog.getByText("1 variant selected")).toBeVisible()
  }
})
