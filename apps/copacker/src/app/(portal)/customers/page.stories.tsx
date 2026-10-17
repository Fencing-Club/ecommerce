import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { can, type Permissions } from "@/lib/access"
import { customerEditor, customerListData } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"
import PageView from "./page"

function CustomersPage({ list, permissions }: { list: typeof customerListData; permissions: Permissions }) {
  const customers = list.customers.map((customer) => ({
    ...customer,
    spent: can(permissions, "prices") ? customer.spent : []
  }))
  return <PageView page={{ customers: customers, catalogs: list.catalogs }} />
}

const meta = preview.meta({
  title: "Pages/Supplier/Customers",
  ...pageStory("/customers", CustomersPage, "supplier"),
  args: { list: customerListData, permissions: owner }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Customers" })).toBeVisible()
    const harbor = within(canvas.getByRole("link", { name: "Harbor Goods" }).closest("tr")!)
    await expect(harbor.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toHaveTextContent("Wholesale 2026")
    await expect(harbor.getByText("$12,840")).toBeVisible()
  }
})

export const Empty = meta.story({
  args: { list: { catalogs: customerListData.catalogs, customers: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No customers yet")).toBeVisible()
  }
})

// A member who assigns catalogs without seeing prices: the page leaves out what customers spent.
export const WithoutPrices = meta.story({
  args: { permissions: customerEditor },
  parameters: { permissions: customerEditor },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: "Amount spent" })).toBeNull()
    await expect(canvas.queryByText("$12,840")).toBeNull()
    await expect(canvas.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toBeEnabled()
  }
})
