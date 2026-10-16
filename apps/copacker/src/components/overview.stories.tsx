import { expect, fn, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { buyerOverview, setupSteps, unconnectedOverview } from "@/stories/fixtures/overview"
import { OverviewDashboard, OverviewFilters, OverviewFiltersSkeleton, OverviewSkeleton } from "./overview"

const noSales = buyerOverview.sales.daily.map((day) => ({ ...day, amazon: null, shopify: null }))

const meta = preview.meta({
  component: OverviewDashboard,
  args: { data: buyerOverview, refresh: fn() },
  parameters: { layout: "fullscreen" }
})

export const Dashboard = meta.story({
  play: async ({ canvas }) => {
    const kpis = canvas.getByRole("region", { name: "Sales, Last 30 days" })
    await expect(within(kpis).getByText("$22,448")).toBeVisible()
    await expect(within(kpis).getByText("465")).toBeVisible()
    await expect(within(kpis).getByText("$48.27")).toBeVisible()
    await expect(within(kpis).getByText("825")).toBeVisible()
    await expect(within(kpis).getByText("$4,123")).toBeVisible()
    await expect(within(kpis).getByText("28%")).toBeVisible()
    await expect(within(kpis).getByText("$1,240")).toBeVisible()
    await expect(within(kpis).getByText("$960 lost this period")).toBeVisible()
    await expect(within(kpis).getAllByText("vs previous period").length).toBeGreaterThan(0)

    for (const name of ["Sales", "Purchasing", "Products and customers", "Stock"]) {
      await expect(canvas.getByRole("heading", { level: 2, name })).toBeVisible()
    }
    // Every setup step is done, so the checklist is gone.
    await expect(canvas.queryByText("Finish setting up")).toBeNull()
    await expect(canvas.getByRole("link", { name: /2 items will run out/ })).toHaveAttribute(
      "href",
      "/restock?status=order"
    )
    await expect(canvas.getByText("Shopify customers")).toBeVisible()

    // What gross profit leaves out, behind its info icon.
    await userEvent.hover(within(kpis).getByRole("button", { name: "About Gross profit" }))
    await expect(await screen.findByText("Some fees are estimated until the platform posts them.")).toBeInTheDocument()
  }
})

// With Amazon chosen, Restock links open on Amazon, and customers (a Shopify figure) aren't shown.
export const AmazonChannel = meta.story({
  args: {
    data: {
      ...buyerOverview,
      channel: { key: "amazon", label: "Amazon" },
      restockChannel: "amazon",
      sales: { ...buyerOverview.sales, sources: ["amazon"], customers: null }
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /2 items will run out/ })).toHaveAttribute(
      "href",
      "/restock?status=order&channel=amazon"
    )
    await expect(canvas.getByRole("heading", { level: 2, name: "Products" })).toBeVisible()
    await expect(canvas.queryByText("Shopify customers")).toBeNull()
    await expect(canvas.getByRole("link", { name: /Reorders due now/ })).toHaveAttribute(
      "href",
      "/restock?status=order&channel=amazon"
    )
  }
})

// A Shopify location's sales are the orders shipped from it.
export const ShopifyLocation = meta.story({
  args: { data: { ...buyerOverview, channel: { key: "shopify:81234", label: "Harbor Warehouse" } } },
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByRole("button", { name: "About sales" }))
    await expect(await screen.findByText(/Shopify orders shipped from Harbor Warehouse/)).toBeInTheDocument()
    await expect(screen.getByText(/2 Amazon orders from outside North America/)).toBeInTheDocument()
  }
})

export const NoOrdersYet = meta.story({
  args: {
    data: {
      ...buyerOverview,
      sales: {
        ...buyerOverview.sales,
        daily: noSales,
        previousDaily: noSales,
        currency: null,
        profit: { ...buyerOverview.sales.profit, costedRevenueMinor: 0, margin: null }
      }
    }
  },
  play: async ({ canvas }) => {
    const kpis = canvas.getByRole("region", { name: "Sales, Last 30 days" })
    await expect(within(kpis).getAllByText("No orders synced")).toHaveLength(5)
    await expect(within(kpis).getAllByText("Not available").length).toBeGreaterThanOrEqual(4)
    await expect(canvas.getAllByText("No orders synced")).toHaveLength(6)
    await expect(canvas.getByText("Needs order prices and unit costs")).toBeVisible()
  }
})

export const SetupUnfinished = meta.story({
  args: { data: { ...buyerOverview, setup: setupSteps } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Finish setting up")).toBeVisible()
    await expect(canvas.getByText("1 of 4 done")).toBeVisible()
  }
})

// The period and channel pickers beside the title, once the overview's data has loaded.
export const Filters = meta.story({
  render: ({ data }) => <OverviewFilters data={data} onPeriodChange={fn()} onChannelChange={fn()} />,
  parameters: { layout: "padded", nextjs: { navigation: { pathname: "/overview" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Last 30 days/ })).toBeVisible()
    await expect(canvas.getByRole("combobox", { name: "Channel" })).toHaveTextContent("All channels")
  }
})

// One channel has nothing to choose between.
export const FiltersOneChannel = meta.story({
  render: ({ data }) => <OverviewFilters data={data} onPeriodChange={fn()} onChannelChange={fn()} />,
  args: { data: { ...buyerOverview, channels: [{ key: "amazon", label: "Amazon" }] } },
  parameters: { layout: "padded" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Last 30 days/ })).toBeVisible()
    await expect(canvas.queryByRole("combobox", { name: "Channel" })).toBeNull()
  }
})

// Without a connected store there's nothing to filter.
export const FiltersWithoutStores = meta.story({
  render: ({ data }) => <OverviewFilters data={data} onPeriodChange={fn()} onChannelChange={fn()} />,
  args: { data: unconnectedOverview },
  parameters: { layout: "padded" },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button")).toBeNull()
    await expect(canvas.queryByRole("combobox")).toBeNull()
  }
})

export const FiltersLoading = meta.story({
  render: () => (
    <div className="flex gap-2">
      <OverviewFiltersSkeleton />
    </div>
  ),
  parameters: { layout: "padded" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll("[data-slot=skeleton]")).toHaveLength(2)
  }
})

export const Loading = meta.story({
  render: () => <OverviewSkeleton />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByLabelText("Loading overview")).toHaveAttribute("aria-busy", "true")
    // The checklist, six KPI tiles and the sales row.
    await expect(canvasElement.querySelectorAll("[data-slot=skeleton]")).toHaveLength(9)
  }
})
