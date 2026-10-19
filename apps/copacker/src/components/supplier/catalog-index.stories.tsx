import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { catalogIds, catalogRows, catalogViewer } from "@/stories/fixtures/supplier"
import { CatalogIndex } from "./catalog-index"

const meta = preview.meta({
  title: "Components/Supplier workspace/Catalog index",
  component: CatalogIndex,
  args: { catalogs: catalogRows }
})

const rowOf = (canvas: ReturnType<typeof within>, title: string) =>
  within(canvas.getByRole("link", { name: title }).closest("tr")!)

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Wholesale 2026" })).toHaveAttribute(
      "href",
      `/catalogs/${catalogIds.wholesale}`
    )
    const wholesale = rowOf(canvas, "Wholesale 2026")
    await expect(wholesale.getByText("Harbor Goods and 1 more")).toBeVisible()
    await expect(wholesale.getByText("10% off")).toBeVisible()
    await expect(wholesale.getByText("Active")).toBeVisible()
    const retail = rowOf(canvas, "Retail partners")
    await expect(retail.getByText("Pine & Paper Co.")).toBeVisible()
    await expect(retail.getByText("5% more")).toBeVisible()
    const legacy = rowOf(canvas, "Legacy pricing")
    await expect(legacy.getByText("No customers")).toBeVisible()
    // No overrides and no adjustment read as None.
    await expect(legacy.getAllByText("None")).toHaveLength(2)
    await expect(canvas.getByRole("tab", { name: /All\s*3/ })).toHaveAttribute("aria-selected", "true")
  }
})

export const FilterByStatus = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /Draft\s*1/ }))
    await expect(canvas.getByRole("link", { name: "Retail partners" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Wholesale 2026" })).toBeNull()
    await userEvent.click(canvas.getByRole("tab", { name: /Archived\s*1/ }))
    await expect(canvas.getByRole("link", { name: "Legacy pricing" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Retail partners" })).toBeNull()
  }
})

export const SearchByCustomer = meta.story({
  play: async ({ canvas }) => {
    const search = canvas.getByRole("searchbox", { name: "Search catalogs" })
    // A catalog is found by the customers it's assigned to, as well as its title.
    await userEvent.type(search, "summit")
    await expect(canvas.getByRole("link", { name: "Wholesale 2026" })).toBeVisible()
    await expect(canvas.getAllByRole("row")).toHaveLength(2)
    await userEvent.clear(search)
    await userEvent.type(search, "fencing")
    await expect(canvas.getByText("No catalogs here")).toBeVisible()
    await expect(canvas.getByText("Try another tab or search.")).toBeVisible()
  }
})

export const Empty = meta.story({
  args: { catalogs: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No catalogs yet")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Create catalog" })).toHaveAttribute("href", "/catalogs/new")
  }
})

export const EmptyForViewer = meta.story({
  args: { catalogs: [] },
  parameters: { permissions: catalogViewer },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No catalogs yet")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Create catalog" })).toBeNull()
  }
})
