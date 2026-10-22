import { Building2, MapPin, Warehouse } from "lucide-react"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { RoutePill } from "./route-pill"
import { RouteStops } from "./route-stops"

const meta = preview.meta({
  title: "Components/Purchase orders/Route stops",
  component: RouteStops,
  args: {
    supplier: <RoutePill icon={<Building2 />}>Lotus Manufacturing</RoutePill>,
    destination: <RoutePill icon={<MapPin />}>Oakland warehouse</RoutePill>
  }
})

// Straight from the supplier to where the goods go: one arrow between them.
export const Direct = meta.story({
  play: async ({ canvasElement, canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing")).toBeVisible()
    await expect(canvas.getByText("Oakland warehouse")).toBeVisible()
    await expect(canvasElement.querySelectorAll("svg.lucide-arrow-right")).toHaveLength(1)
  }
})

// By way of a forwarder's stop, with the route's action after it.
export const WithStop = meta.story({
  args: {
    stop: <RoutePill icon={<Warehouse />}>Bayline Freight, Ningbo warehouse</RoutePill>,
    children: (
      <Button variant="outline" size="sm" className="ms-auto">
        Edit
      </Button>
    )
  },
  play: async ({ canvasElement, canvas }) => {
    await expect(canvasElement.querySelectorAll("svg.lucide-arrow-right")).toHaveLength(2)
    const stops = [...canvasElement.querySelectorAll(".truncate")].map((stop) => stop.textContent)
    await expect(stops).toEqual(["Lotus Manufacturing", "Bayline Freight, Ningbo warehouse", "Oakland warehouse"])
    await expect(canvas.getByRole("button", { name: "Edit" })).toBeVisible()
  }
})
