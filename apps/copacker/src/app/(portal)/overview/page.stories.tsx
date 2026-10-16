import { expect, fn, within } from "storybook/test"
import { createTranslator } from "use-intl"
import { storyIntl } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { OverviewPagePending, OverviewPageView } from "@/components/overview-page"
import { canOpen, isAdmin, type Permissions } from "@/lib/access"
import type { Overview } from "@/server/overview"
import type { SupplierOverviewData } from "@/server/supplier-overview"
import { buyerOverview, supplierOverviewData, unconnectedOverview } from "@/stories/fixtures/overview"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"

type Args = { permissions: Permissions; data: Overview; supplier: SupplierOverviewData }

// The production view renders the same permission-filtered DTO as the server loader. These stories supply fixtures;
// the loader's authorization and field selection have separate server tests.
function BuyerOverviewPage({ permissions, data }: Args) {
  return (
    <OverviewPageView
      refresh={fn()}
      onPeriodChange={fn()}
      onChannelChange={fn()}
      page={{
        kind: "buyer",
        admin: isAdmin(permissions),
        data: {
          ...data,
          attention: data.attention.filter((item) => canOpen(permissions, item.href)),
          setup: isAdmin(permissions) ? data.setup : []
        }
      }}
    />
  )
}
function SupplierOverviewPage({ permissions, supplier }: Args) {
  return (
    <OverviewPageView
      refresh={fn()}
      onPeriodChange={fn()}
      onChannelChange={fn()}
      page={{ kind: "supplier", data: supplier, permissions }}
    />
  )
}

// A member with the Overview (which needs prices) and purchase orders, but not Restock or Shipments.
const reader: Permissions = { role: "member", access: { overview: "view", prices: "view", orders: "view" } }
const buyer = pageStory("/overview", BuyerOverviewPage, "buyer")

const meta = preview.meta({
  title: "Pages/Shared/Overview",
  // Each story renders its workspace's page, whose loaders and portal come with it.
  render: buyer.render,
  args: { permissions: owner, data: buyerOverview, supplier: supplierOverviewData }
})

export const Buyer = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Last 30 days/ })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Channel" })).toHaveTextContent("All channels")
    await expect(page.getByRole("region", { name: "Sales, Last 30 days" })).toBeVisible()
    await expect(page.getByRole("link", { name: /2 items will run out/ })).toBeVisible()
  }
})

// A member sees only what needs attention on pages they can open, and no setup.
export const BuyerForMember = meta.story({
  ...buyer,
  args: { permissions: reader, data: { ...buyerOverview, setup: unconnectedOverview.setup } },
  parameters: { ...buyer.parameters, permissions: reader },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.queryByText("2 items will run out")).toBeNull()
    await expect(page.queryByText("1 shipment needs approval")).toBeNull()
    await expect(page.getByRole("link", { name: /1 draft purchase order/ })).toBeVisible()
    await expect(page.queryByText("Finish setting up")).toBeNull()
  }
})

export const SetupChecklistShown = meta.story({
  ...buyer,
  args: {
    data: { ...buyerOverview, setup: unconnectedOverview.setup.map((step, index) => ({ ...step, done: index < 2 })) }
  },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByText("Finish setting up")).toBeVisible()
    await expect(page.getByText("2 of 4 done")).toBeVisible()
  }
})

export const NoStores = meta.story({
  ...buyer,
  args: { data: unconnectedOverview },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByText("No stores connected")).toBeVisible()
    await expect(page.getByText("Connect Shopify or Amazon to see your overview")).toBeVisible()
    await expect(page.getByRole("button", { name: "Connect stores" })).toHaveAttribute("href", "/settings#integrations")
    await expect(page.getByText("0 of 4 done")).toBeVisible()
    // Nothing to filter without a store.
    await expect(page.queryByRole("combobox", { name: "Channel" })).toBeNull()
  }
})

export const NoStoresForMember = meta.story({
  ...buyer,
  args: { permissions: reader, data: unconnectedOverview },
  parameters: { ...buyer.parameters, permissions: reader },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByText("Ask an admin to connect them")).toBeVisible()
    await expect(page.queryByRole("button", { name: "Connect stores" })).toBeNull()
    await expect(page.queryByText("Finish setting up")).toBeNull()
  }
})

export const Loading = meta.story({
  ...pageStory("/overview", () => <OverviewPagePending />, "buyer"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Loading overview")).toHaveAttribute("aria-busy", "true")
  }
})

export const Supplier = meta.story({
  ...pageStory("/overview", SupplierOverviewPage, "supplier"),
  play: async ({ canvas }) => {
    const t = createTranslator(storyIntl())
    const page = within(canvas.getByRole("main"))
    await expect(page.getByRole("heading", { level: 1, name: t("overview.title") })).toBeVisible()
    await expect(page.getByRole("button", { name: t("overview.period.presets.last30") })).toBeVisible()
    await expect(page.getAllByText(t("supplier.overview.ordersReceived"))[0]).toBeVisible()
    await expect(page.getAllByText("Harbor Goods")[0]).toBeVisible()
    await expect(page.getByText(t("supplier.overview.tasks.pack", { count: 2 }))).toBeVisible()
  }
})
