import { getTranslations } from "next-intl/server"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { PageHeader } from "@/components/common"
import { CustomerIndex } from "@/components/supplier/customers"
import { can, type Permissions } from "@/lib/access"
import { customerEditor, customerListData } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"

// The supplier's Customers page (page.tsx) with the customers and catalogs the database would return.
async function CustomersPage({ list, permissions }: { list: typeof customerListData; permissions: Permissions }) {
  const t = await getTranslations("supplier.pages")
  const { catalogs } = list
  // Someone who doesn't see prices gets no amounts spent.
  const customers = can(permissions, "prices")
    ? list.customers
    : list.customers.map((customer) => ({ ...customer, spent: [] }))
  return (
    <>
      <PageHeader title={t("customers")} />
      <CustomerIndex customers={customers} catalogs={catalogs} />
    </>
  )
}

const meta = preview.meta({
  title: "Pages/Customers",
  ...pageStory("/customers", CustomersPage, "supplier"),
  args: { list: customerListData, permissions: owner }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Customers" })).toBeVisible()
    const harbor = within(canvas.getByRole("link", { name: "Harbor Goods" }).closest("tr")!)
    await expect(harbor.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toHaveTextContent("Wholesale 2026")
    await expect(harbor.getByText("$12,840.00")).toBeVisible()
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
    await expect(canvas.queryByText("$12,840.00")).toBeNull()
    await expect(canvas.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toBeEnabled()
  }
})
