import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { ProductShowcase } from "./product-showcase"

const meta = preview.meta({
  title: "Components/Auth/Product showcase",
  component: ProductShowcase,
  parameters: { layout: "fullscreen" }
})

export const Default = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Copacker")).toBeVisible()
    await expect(canvas.getByText("handled.")).toHaveClass("bg-clip-text")
    await expect(canvas.getByText(/Forecast demand, send purchase orders, and ship to Amazon/)).toBeVisible()
    // The cards are a picture of the product; the headline says it for screen readers.
    const cards = canvasElement.querySelector("aside > div[aria-hidden]:last-child")
    await expect(cards).not.toBeNull()
    const picture = within(cards instanceof HTMLElement ? cards : canvasElement)
    await expect(picture.getByText("Lead time 60 days")).toBeInTheDocument()
    await expect(picture.getByText("Steel Bottle 32 oz")).toBeInTheDocument()
    await expect(picture.getByText("18 days")).toBeInTheDocument()
    await expect(picture.getByText("2,520")).toBeInTheDocument()
    await expect(picture.getByText("133 days")).toBeInTheDocument()
    await expect(picture.getByText("—")).toBeInTheDocument()
    await expect(picture.getByText("$13,650")).toBeInTheDocument()
    await expect(picture.getByText("With supplier")).toBeInTheDocument()
    await expect(picture.getByText("Shipment to AWD US")).toBeInTheDocument()
    await expect(picture.getByText("40 cartons")).toBeInTheDocument()
    await expect(picture.getAllByRole("listitem", { hidden: true })).toHaveLength(3)
  }
})
