import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { RoutePreview } from "./route-preview"

const meta = preview.meta({
  title: "Components/Shipments/Route preview",
  component: RoutePreview,
  args: { stops: ["Northwind Textiles", "Bayline Freight", "Amazon AWD US"] }
})

// By way of a forwarder: the supplier, the stop on the way and where the goods end up, an arrow between each.
export const ThroughForwarder = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const stops = canvas.getAllByRole("listitem").map((stop) => stop.textContent)
    await expect(stops).toEqual(["Northwind Textiles", "Bayline Freight", "Amazon AWD US"])
    await expect(canvas.getByRole("list", { name: "Route" })).toBeVisible()
    for (const arrow of canvasElement.querySelectorAll("svg.lucide-arrow-right")) {
      await expect(arrow).toBeVisible()
    }
  }
})

// Straight from the supplier to where the goods end up: one arrow.
export const Direct = meta.story({
  args: { stops: ["Lotus Manufacturing", "Harbor Goods / Portland warehouse"] },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole("listitem")).toHaveLength(2)
    await expect(canvasElement.querySelectorAll("svg.lucide-arrow-right")).toHaveLength(1)
  }
})
