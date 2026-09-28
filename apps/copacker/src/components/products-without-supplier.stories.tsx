import { http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { suppliers, withoutSupplier } from "@/stories/fixtures/catalog"
import { member } from "@/stories/workspace"
import { ProductsWithoutSupplier } from "./products-without-supplier"

// The suppliers each story assigned, in order, and how often it listed the products.
let assigned: unknown[] = []
let listed = 0

const meta = preview.meta({
  component: ProductsWithoutSupplier,
  args: { syncKey: "synced" },
  beforeEach: ({ msw }) => {
    assigned = []
    listed = 0
    msw.use(
      http.get("/api/products/without-supplier", () => {
        listed += 1
        return HttpResponse.json(withoutSupplier)
      }),
      http.get("/api/restock/suppliers", () => HttpResponse.json(suppliers)),
      http.post("/api/restock/assign-supplier", async ({ request }) => {
        assigned.push(await request.json())
        return HttpResponse.json({ updated: 1 })
      })
    )
  }
})

async function openPanel() {
  await userEvent.click(await screen.findByRole("button", { name: /3 products have no supplier/ }))
  return within(await screen.findByRole("table"))
}

export const Assign = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Restock skips them")).toBeVisible()
    const table = await openPanel()
    await expect(table.getByText("NAPKIN-1, NAPKIN-2, NAPKIN-3 and 2 more")).toBeVisible()
    await expect(table.getByText("None set in Shopify")).toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Assign" })).toBeDisabled()

    await userEvent.click(table.getByRole("checkbox", { name: "Select Linen apron" }))
    await userEvent.click(canvas.getByRole("combobox", { name: "Supplier for the selected products" }))
    await userEvent.click(await screen.findByRole("option", { name: "Northwind Textiles" }))
    await userEvent.click(canvas.getByRole("button", { name: "Assign to 1 product" }))
    await waitFor(() =>
      expect(assigned).toEqual([{ productIds: ["gid://shopify/Product/502"], supplierId: suppliers[1]!.id }])
    )
    // The ticks clear once saved.
    await expect(await canvas.findByRole("button", { name: "Assign" })).toBeDisabled()
  }
})

export const SelectAll = meta.story({
  play: async ({ canvas }) => {
    const table = await openPanel()
    const all = table.getByRole("checkbox", { name: "Select all products" })
    await userEvent.click(table.getByRole("checkbox", { name: "Select Jute twine" }))
    await expect(all).toHaveAttribute("aria-checked", "mixed")
    await userEvent.click(all)
    await expect(all).toHaveAttribute("aria-checked", "true")
    // Without a supplier chosen there's nothing to assign to.
    await expect(canvas.getByRole("button", { name: "Assign to 3 products" })).toBeDisabled()
    await userEvent.click(all)
    await expect(canvas.getByRole("button", { name: "Assign" })).toBeDisabled()
  }
})

export const AssignFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/restock/assign-supplier", () =>
        HttpResponse.json({ error: "That supplier was removed" }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    const table = await openPanel()
    await userEvent.click(table.getByRole("checkbox", { name: "Select Cotton napkins" }))
    await userEvent.click(canvas.getByRole("combobox", { name: "Supplier for the selected products" }))
    await userEvent.click(await screen.findByRole("option", { name: "Lotus Manufacturing" }))
    await userEvent.click(canvas.getByRole("button", { name: "Assign to 1 product" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("That supplier was removed")
    // The product stays ticked to try again.
    await expect(table.getByRole("checkbox", { name: "Select Cotton napkins" })).toHaveAttribute("aria-checked", "true")
  }
})

// Without a supplier to choose, the panel says where to add one.
export const NoSuppliers = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/restock/suppliers", () => HttpResponse.json([])))
  },
  play: async ({ canvas }) => {
    await openPanel()
    await expect(canvas.getByRole("link", { name: "Partners" })).toHaveAttribute("href", "/partners")
    await expect(canvas.queryByRole("combobox")).toBeNull()
  }
})

// Every product has a supplier: nothing to show.
export const AllAssigned = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/products/without-supplier", () => {
        listed += 1
        return HttpResponse.json([])
      })
    )
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(listed).toBe(1))
    await expect(canvasElement).toBeEmptyDOMElement()
  }
})

// Assigning suppliers changes products, so someone who only views them doesn't see the panel.
export const ForMember = meta.story({
  parameters: { permissions: member },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(listed).toBe(1))
    await expect(canvasElement).toBeEmptyDOMElement()
  }
})
