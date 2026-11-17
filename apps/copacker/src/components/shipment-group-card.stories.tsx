import { Checkbox } from "@buildkitgg/shadcn"
import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { ShipmentGroupCard } from "./shipment-group-card"

const meta = preview.meta({
  title: "Components/Purchase orders/Shipment group card",
  component: ShipmentGroupCard,
  args: {
    title: "FBA",
    lines: 2,
    pieces: 180,
    total: 194_800,
    currency: "USD",
    children: <p className="p-3">Canvas tote bag, Linen apron</p>
  }
})

// Named by where it goes, with its lines, pieces and total; it collapses to its header.
export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 2, name: "FBA shipment" })).toBeVisible()
    const toggle = canvas.getByRole("button", { name: /FBA shipment/ })
    await expect(toggle).toHaveTextContent("2 variants, 180 pieces")
    await expect(toggle).toHaveTextContent("Shipment total $1,948")
    await expect(canvas.getByText("Canvas tote bag, Linen apron")).toBeVisible()
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.getByText("Canvas tote bag, Linen apron")).not.toBeVisible()
  }
})

// For someone who doesn't see prices, no total; in the editor, a checkbox before its name and a smaller heading.
export const WithoutPricesAndSelectable = meta.story({
  args: {
    total: undefined,
    heading: "h3",
    select: <Checkbox aria-label="Select all products for FBA" />
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 3, name: "FBA shipment" })).toBeVisible()
    await expect(canvas.queryByText(/\$/)).toBeNull()
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products for FBA" }))
    await expect(canvas.getByRole("checkbox", { name: "Select all products for FBA" })).toBeChecked()
    // Choosing doesn't collapse the card.
    await expect(canvas.getByRole("button", { name: /FBA shipment/ })).toHaveAttribute("aria-expanded", "true")
  }
})
