import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { dialogWidth } from "@/stories/booking"
import { SummaryList } from "./summary-list"

const meta = preview.meta({
  component: SummaryList,
  args: {
    items: [
      { label: "Warehouse", value: "Hagerstown, MD", detail: "HGR6" },
      { label: "Carrier", value: "Amass standard truck", detail: "Ocean LCL" },
      { label: "Pickup", value: "Zhangjiagang, China", detail: "Ready Oct 21" },
      { label: "Placement fee", value: "$40.20" },
      { label: "Shipping", value: "$103.92" }
    ],
    total: { label: "Total", value: "$144.12" }
  },
  decorators: [dialogWidth]
})

// What the booking comes to: each part as a term and its value, details under the values, and the total last and
// stronger.
export const Default = meta.story({
  play: async ({ canvas }) => {
    const terms = canvas.getAllByRole("term").map((term) => term.textContent)
    await expect(terms).toEqual(["Warehouse", "Carrier", "Pickup", "Placement fee", "Shipping", "Total"])
    await expect(canvas.getByText("Ready Oct 21")).toBeVisible()
    const total = canvas.getByText("$144.12")
    await expect(total.tagName).toBe("DD")
    await expect(Number(getComputedStyle(total).fontWeight)).toBeGreaterThan(
      Number(getComputedStyle(canvas.getByText("$103.92")).fontWeight)
    )
  }
})

// Prices that expired show as dashes until they're refreshed, and the details go with them.
export const Expired = meta.story({
  args: {
    items: [
      { label: "Warehouse", value: "Hagerstown, MD" },
      { label: "Carrier", value: "Amass standard truck" },
      { label: "Placement fee", value: "—" },
      { label: "Shipping", value: "—" }
    ],
    total: { label: "Total", value: "—" }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("—")).toHaveLength(3)
    await expect(canvas.queryByText("HGR6")).toBeNull()
  }
})
