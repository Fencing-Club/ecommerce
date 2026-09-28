import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Planner } from "./planner"

// The forecast as the home page sets it, on the paper.
const meta = preview.meta({
  component: Planner,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="light bg-(--paper) p-6 [--paper:oklch(0.972_0.008_78)]">
        <Story />
      </div>
    )
  ]
})

// A figure under the chart, by its term: "Order by", "Order", "Runs out without it" or "Lost sales".
function stat(root: HTMLElement, term: string) {
  const row = within(root).getByText(term, { selector: "dt" }).parentElement
  if (!row) {
    throw new Error(`${term} has its figure`)
  }
  return row
}

// The chart itself, drawn in its own units, 1000 wide.
function chart(root: HTMLElement) {
  return root.querySelector('svg[viewBox^="0 0 1000 "]')
}

export const Default = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Steel Bottle 32 oz")).toBeVisible()
    await expect(canvas.getByText("10,200 in stock")).toBeVisible()
    for (const store of ["Amazon", "Shopify", "eBay"]) {
      await expect(canvas.getByRole("button", { name: new RegExp(store) })).toHaveAttribute("aria-pressed", "true")
    }
    await expect(canvas.getByRole("slider", { name: "Lead time" })).toHaveValue("60")
    await expect(canvas.getByText("60 days", { selector: "span" })).toBeVisible()
    await expect(canvas.getByRole("switch", { name: "Holiday rush" })).toBeChecked()

    // Ordered in time, the reorder lands before the shelf is empty.
    await expect(stat(canvasElement, "Order by")).toHaveTextContent("In 9 days")
    await expect(stat(canvasElement, "Order by")).toHaveTextContent("Lands before it runs out")
    await expect(stat(canvasElement, "Order")).toHaveTextContent("11,520 units")
    await expect(stat(canvasElement, "Order")).toHaveTextContent("480 cartons")
    await expect(stat(canvasElement, "Runs out without it")).toHaveTextContent("In 79 days")
    await expect(stat(canvasElement, "Lost sales")).toHaveTextContent("None")
    await expect(stat(canvasElement, "Lost sales")).toHaveTextContent("In stock the whole way")
    // The chart is a picture, described for screen readers.
    await expect(
      canvas.getByText(
        "Stock of the Steel Bottle 32 oz over the next 150 days. Without a reorder it runs out in 79 days. Ordered in 9 days, 11,520 units land before it runs out."
      )
    ).toBeInTheDocument()
    await expect(chart(canvasElement)).toHaveTextContent("Holiday rush")
  }
})

// The longest lead time can't beat the rush: order today, and it still lands late, with sales lost.
export const LongLeadTime = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const slider = canvas.getByRole("slider", { name: "Lead time" })
    await userEvent.click(slider)
    await userEvent.keyboard("{ArrowRight}")
    await expect(slider).toHaveValue("65")
    await expect(canvas.getByText("65 days", { selector: "span" })).toBeVisible()
    await waitFor(() => expect(stat(canvasElement, "Order by")).toHaveTextContent("In 4 days"))

    await userEvent.keyboard("{End}")
    await expect(slider).toHaveValue("120")
    await expect(slider).toHaveAttribute("aria-valuetext", "120 days")
    await waitFor(() => expect(stat(canvasElement, "Order by")).toHaveTextContent("Today"))
    await expect(stat(canvasElement, "Order by")).toHaveTextContent("It lands after it runs out")
    await expect(stat(canvasElement, "Order by").querySelector("dd")).toHaveClass("text-destructive")
    await waitFor(() => expect(stat(canvasElement, "Lost sales")).toHaveTextContent("$179,300"))
    await expect(stat(canvasElement, "Lost sales")).toHaveTextContent("While it’s out of stock")
    await expect(chart(canvasElement)).toHaveTextContent("Order today")
    await expect(
      canvas.getByText(/Ordered today, 8,928 units land after it runs out, losing about \$179,300/)
    ).toBeInTheDocument()
  }
})

// Without the rush the stock lasts longer, so the order can wait.
export const WithoutRush = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("switch", { name: "Holiday rush" }))
    await expect(canvas.getByRole("switch", { name: "Holiday rush" })).not.toBeChecked()
    await waitFor(() => expect(stat(canvasElement, "Order by")).toHaveTextContent("In 33 days"))
    await expect(stat(canvasElement, "Runs out without it")).toHaveTextContent("In 103 days")
    await expect(stat(canvasElement, "Order")).toHaveTextContent("8,928 units")
  }
})

// Selling through eBay alone, the stock lasts the season, and the last store on can't be turned off.
export const OneStore = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const amazon = canvas.getByRole("button", { name: /Amazon/ })
    const shopify = canvas.getByRole("button", { name: /Shopify/ })
    const ebay = canvas.getByRole("button", { name: /eBay/ })
    await userEvent.click(amazon)
    await userEvent.click(shopify)
    await expect(amazon).toHaveAttribute("aria-pressed", "false")
    await expect(shopify).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(ebay)
    await expect(ebay).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(stat(canvasElement, "Runs out without it")).toHaveTextContent("Not this season"))
    await waitFor(() => expect(stat(canvasElement, "Order")).toHaveTextContent("1,104 units"))
    // Back on, Amazon's sales count again.
    await userEvent.click(amazon)
    await expect(amazon).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(stat(canvasElement, "Runs out without it")).not.toHaveTextContent("Not this season"))
  }
})

// A phone draws the chart taller, with the rush's label shortened.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(chart(canvasElement)).toHaveAttribute("viewBox", "0 0 1000 900"))
    await expect(chart(canvasElement)).toHaveTextContent("Rush")
    await expect(chart(canvasElement)).not.toHaveTextContent("Holiday rush")
  }
})
