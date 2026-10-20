import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import {
  catalogIds,
  catalogOptions,
  catalogViewer,
  customerEditor,
  customerIds,
  customerRows
} from "@/stories/fixtures/supplier"
import { CatalogPicker, CustomerIndex } from "./customers"

// Each catalog assignment the page sent: the customer and its body.
const assigned = fn()

const meta = preview.meta({
  title: "Components/Supplier workspace/Customers",
  component: CustomerIndex,
  args: { customers: customerRows, catalogs: catalogOptions },
  beforeEach: ({ msw }) => {
    assigned.mockClear()
    msw.use(
      http.post("/api/customers/:id/catalog", async ({ params, request }) => {
        assigned(params.id, await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

const rowOf = (name: string) => within(screen.getByRole("link", { name }).closest("tr")!)

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Harbor Goods" })).toHaveAttribute(
      "href",
      `/customers/${customerIds.harbor}`
    )
    const harbor = rowOf("Harbor Goods")
    await expect(harbor.getByText("2 open")).toBeVisible()
    await expect(harbor.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toHaveTextContent("Wholesale 2026")
    await expect(harbor.getByText("$12,840")).toBeVisible()
    await expect(harbor.getByText("€960")).toBeVisible()
    // A catalog that isn't active says so.
    await expect(rowOf("Pine & Paper Co.").getByRole("combobox")).toHaveTextContent("Retail partners (draft)")
    const bluebird = rowOf("Bluebird Home")
    await expect(bluebird.getByText(/^Since /)).toBeVisible()
    await expect(bluebird.getByRole("combobox")).toHaveTextContent("No catalog")
    // No orders yet: no last order and nothing spent.
    await expect(bluebird.getAllByText("—")).toHaveLength(2)
    await expect(canvas.getByRole("columnheader", { name: "Amount spent" })).toBeVisible()
  }
})

export const AssignCatalog = meta.story({
  play: async () => {
    await userEvent.click(rowOf("Bluebird Home").getByRole("combobox", { name: "Catalog for Bluebird Home" }))
    // No catalog explains itself in the list.
    await expect(
      await screen.findByRole("option", { name: /No catalog\s*All products at list prices/ })
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("option", { name: "Legacy pricing (archived)" }))
    await waitFor(() => expect(assigned).toHaveBeenCalledWith(customerIds.bluebird, { catalogId: catalogIds.legacy }))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    await expect(rowOf("Bluebird Home").getByRole("combobox")).toHaveTextContent("Legacy pricing (archived)")
  }
})

export const RemoveCatalog = meta.story({
  play: async () => {
    await userEvent.click(rowOf("Summit Outfitters").getByRole("combobox"))
    await userEvent.click(await screen.findByRole("option", { name: /No catalog/ }))
    await waitFor(() => expect(assigned).toHaveBeenCalledWith(customerIds.summit, { catalogId: null }))
  }
})

export const AssignFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/customers/:id/catalog", () =>
        HttpResponse.json({ error: "That catalog was deleted." }, { status: 404 })
      )
    )
  },
  play: async () => {
    await userEvent.click(rowOf("Harbor Goods").getByRole("combobox"))
    await userEvent.click(await screen.findByRole("option", { name: "Retail partners (draft)" }))
    await expect(await rowOf("Harbor Goods").findByText("That catalog was deleted.")).toBeVisible()
    // The customer keeps the catalog it had.
    await expect(rowOf("Harbor Goods").getByRole("combobox")).toHaveTextContent("Wholesale 2026")
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

export const WithOpenOrders = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /With open orders\s*2/ }))
    await expect(canvas.getByRole("link", { name: "Harbor Goods" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Summit Outfitters" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Bluebird Home" })).toBeNull()
    await userEvent.click(canvas.getByRole("tab", { name: /No catalog\s*1/ }))
    await expect(canvas.getByRole("link", { name: "Bluebird Home" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Harbor Goods" })).toBeNull()
  }
})

export const Search = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search customers" }), "paper")
    await expect(canvas.getByRole("link", { name: "Pine & Paper Co." })).toBeVisible()
    await expect(canvas.getAllByRole("link")).toHaveLength(1)
    await userEvent.type(canvas.getByRole("searchbox"), "s")
    await expect(canvas.getByText("No customers here")).toBeVisible()
  }
})

export const OpenFromRow = meta.story({
  play: async () => {
    await userEvent.click(rowOf("Summit Outfitters").getByText("1 open"))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/customers/${customerIds.summit}` })
  }
})

export const Empty = meta.story({
  args: { customers: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No customers yet")).toBeVisible()
    await expect(
      canvas.getByText("Buyers appear here once they invite you as their supplier and you accept.")
    ).toBeVisible()
  }
})

// A member who assigns catalogs without seeing prices: the page leaves out what each customer spent.
export const WithoutPrices = meta.story({
  args: { customers: customerRows.map((customer) => ({ ...customer, spent: [] })) },
  parameters: { permissions: customerEditor },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: "Amount spent" })).toBeNull()
    await expect(canvas.queryByText("$12,840")).toBeNull()
    await userEvent.click(rowOf("Bluebird Home").getByRole("combobox"))
    await userEvent.click(await screen.findByRole("option", { name: "Wholesale 2026" }))
    await waitFor(() =>
      expect(assigned).toHaveBeenCalledWith(customerIds.bluebird, { catalogId: catalogIds.wholesale })
    )
  }
})

// A member who only views customers sees each one's catalog without changing it.
export const ViewOnly = meta.story({
  parameters: { permissions: catalogViewer },
  play: async () => {
    await expect(rowOf("Harbor Goods").getByRole("combobox")).toBeDisabled()
    await expect(rowOf("Harbor Goods").getByText("$12,840")).toBeVisible()
  }
})

export const PickerWithHint = meta.story({
  render: () => (
    <CatalogPicker
      customerId={customerIds.bluebird}
      customer="Bluebird Home"
      catalogs={catalogOptions}
      value={null}
      hint
      className="w-72"
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("All products at list prices")).toBeVisible()
    await userEvent.click(canvas.getByRole("combobox", { name: "Catalog for Bluebird Home" }))
    await userEvent.click(await screen.findByRole("option", { name: "Wholesale 2026" }))
    await waitFor(() => expect(canvas.queryByText("All products at list prices")).toBeNull())
    await waitFor(() =>
      expect(assigned).toHaveBeenCalledWith(customerIds.bluebird, { catalogId: catalogIds.wholesale })
    )
  }
})
