import type { ComponentProps } from "react"
import { expect, fireEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { addDays } from "@/lib/time-zone"
import { OrdersChart } from "./overview-chart"

// Order value by day from `from`, busy every third day, with the period before at a steady $300.
function series(from: string, days: number, previous = true) {
  return Array.from({ length: days }, (_, index) => ({
    day: addDays(from, index),
    value: index % 3 === 0 ? 40_000 + index * 100 : 0,
    orders: index % 3 === 0 ? 2 : 0,
    previous: previous ? 30_000 : null
  }))
}

const meta = preview.meta({
  component: OrdersChart,
  args: {
    series: series("2026-09-01", 30),
    currency: "USD",
    comparison: "previousPeriod"
  } satisfies ComponentProps<typeof OrdersChart>
})

const table = (canvas: ReturnType<typeof within>) => canvas.getByRole("table", { name: "Order value received" })

export const Daily = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("This period")).toBeVisible()
    // In the legend, and heading the table's last column.
    await expect(canvas.getAllByText("Previous period")).toHaveLength(2)
    // The figures behind the bars, for screen readers.
    const rows = within(table(canvas)).getAllByRole("row")
    await expect(rows).toHaveLength(31)
    await expect(
      within(rows[0]!)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual(["Period", "Ordered", "Orders", "Previous period"])
    await expect(
      within(rows[1]!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["$400", "2", "$300"])
    await expect(within(rows[1]!).getByRole("rowheader")).toHaveTextContent("Tue, Sep 1")
    await expect(within(rows[2]!).getAllByRole("cell")[0]).toHaveTextContent("$0")
  }
})

export const Tooltip = meta.story({
  play: async ({ canvasElement }) => {
    const chart = await waitFor(() => {
      const surface = canvasElement.querySelector(".recharts-wrapper")
      expect(surface).not.toBeNull()
      return surface!
    })
    const box = chart.getBoundingClientRect()
    // Over the first bar: its day, what was ordered, and the period before.
    await waitFor(async () => {
      fireEvent.mouseMove(chart, { clientX: box.left + 60, clientY: box.top + box.height / 2 })
      await expect(canvasElement.querySelector(".recharts-tooltip-wrapper")).toHaveTextContent(/Tue, Sep 1/)
    })
    const tooltip = within(canvasElement.querySelector<HTMLElement>(".recharts-tooltip-wrapper")!)
    await expect(tooltip.getByText("$400")).toBeInTheDocument()
    await expect(tooltip.getByText("$300")).toBeInTheDocument()
  }
})

// A quarter reads in weeks, each titled by its first and last day.
export const Weekly = meta.story({
  args: { series: series("2026-06-01", 90), comparison: "previousYear" },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Previous year")).toHaveLength(2)
    const rows = within(table(canvas)).getAllByRole("row")
    await expect(rows).toHaveLength(14)
    await expect(within(rows[1]!).getByRole("rowheader")).toHaveTextContent("Jun 1 – Jun 7")
    // Three busy days in the first week.
    await expect(within(rows[1]!).getAllByRole("cell")[1]).toHaveTextContent("6")
    await expect(within(rows[13]!).getByRole("rowheader")).toHaveTextContent("Aug 24 – Aug 29")
  }
})

// A year reads in months of 30 days.
export const Monthly = meta.story({
  args: { series: series("2025-10-01", 365) },
  play: async ({ canvas }) => {
    const rows = within(table(canvas)).getAllByRole("row")
    await expect(rows).toHaveLength(14)
    await expect(within(rows[1]!).getByRole("rowheader")).toHaveTextContent("Oct 1 – Oct 30")
  }
})

export const WithoutComparison = meta.story({
  args: { comparison: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Previous period")).toBeNull()
    await expect(within(table(canvas)).getAllByRole("columnheader")).toHaveLength(3)
  }
})

// Nothing from before to compare: the comparison is left out.
export const NothingBefore = meta.story({
  args: { series: series("2026-09-01", 30, false) },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Previous period")).toBeNull()
    await expect(within(table(canvas)).getAllByRole("columnheader")).toHaveLength(3)
  }
})
