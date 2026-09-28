import { expect, fireEvent, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import type { DailySales } from "@/server/overview-sales"
import { buyerOverview, dayKey } from "@/stories/fixtures/overview"
import { CoverChart, SalesTrend, Sparkline } from "./overview-charts"

const { sales } = buyerOverview

// Four months of Amazon orders without prices, drawn a week a point.
const longDaily: DailySales[] = Array.from({ length: 120 }, (_, index) => ({
  date: dayKey(120 - index),
  amazon: { orders: 4 + (index % 5), units: 8, revenueMinor: 0, unpriced: 4 + (index % 5) },
  shopify: null,
  ebay: null
}))

const args: React.ComponentProps<typeof SalesTrend> = {
  daily: sales.daily,
  previous: sales.previousDaily,
  comparison: "previousPeriod",
  sources: ["amazon", "shopify"],
  currency: "USD"
}

const meta = preview.meta({
  component: SalesTrend,
  args,
  decorators: [
    (Story) => (
      <div className="flex h-96 w-[720px] flex-col">
        <Story />
      </div>
    )
  ]
})

export const Sales = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByText("All channels")[0]).toBeVisible()
    await expect(canvas.getByText("$22,448")).toBeVisible()
    await expect(canvas.getByText("Previous period")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sales" })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByText("Sales by day")).toBeInTheDocument()

    // The chart draws once it has measured its box; hovering it shows the point's figures.
    await waitFor(() => expect(canvasElement.querySelector(".recharts-area-curve")).not.toBeNull())
    await expect(canvas.getAllByText("All channels, previous period")).toHaveLength(1)
    const chart = canvasElement.querySelector(".recharts-wrapper")!
    const box = chart.getBoundingClientRect()
    await fireEvent.mouseMove(chart, { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 })
    await waitFor(() => expect(canvas.getAllByText("All channels, previous period")).toHaveLength(2))
  }
})

export const SwitchToOrders = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Orders" }))
    await expect(canvas.getByRole("button", { name: "Orders" })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.getByText("465")).toBeVisible()
    await expect(canvas.getByText("Orders by day")).toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Units" }))
    await expect(canvas.getByText("Units sold by day")).toBeInTheDocument()
  }
})

// One source keeps its own name; without prices there's no Sales measure, and without a comparison no dashed line.
export const OneSourceWithoutPrices = meta.story({
  args: { daily: longDaily, previous: null, comparison: "none", sources: ["amazon"], currency: null },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Amazon")[0]).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Sales" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Orders" })).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.queryByText("No comparison")).toBeNull()
    await expect(canvas.getByText("Orders by week")).toBeInTheDocument()
    await expect(canvas.getAllByRole("row")).toHaveLength(1 + 18)
  }
})

export const Trendline = meta.story({
  render: () => (
    <div className="flex w-48 flex-col gap-4">
      <Sparkline id="orders" values={[4, 6, null, 5, 9, 7]} />
      <Sparkline id="single" values={[4, null]} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Only the series with two or more values draws.
    await waitFor(() => expect(canvasElement.querySelectorAll(".recharts-area-curve")).toHaveLength(1))
    await expect(canvasElement.querySelector("#spark-orders")).not.toBeNull()
    await expect(canvasElement.querySelector("#spark-single")).toBeNull()
  }
})

export const Cover = meta.story({
  render: () => (
    <CoverChart
      buckets={[
        { key: "out", label: "Out of stock", items: 3, href: "/restock?cover=out" },
        { key: "under14", label: "Under 2 weeks", items: 12, href: "/restock?cover=under14" },
        { key: "unsold", label: "Not selling", items: 0, href: null }
      ]}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Out of stock/ })).toHaveAttribute("href", "/restock?cover=out")
    await expect(canvas.getByRole("link", { name: /12 items/ })).toHaveAttribute("href", "/restock?cover=under14")
    await expect(canvas.queryByRole("link", { name: /Not selling/ })).toBeNull()
    await expect(canvas.getByText("0 items")).toBeInTheDocument()
  }
})
