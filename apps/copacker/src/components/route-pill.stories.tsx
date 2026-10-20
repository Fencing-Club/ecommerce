import { Factory, Ship, Warehouse } from "lucide-react"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { RoutePill } from "./route-pill"

const meta = preview.meta({
  title: "Components/App shell/Route pill",
  component: RoutePill,
  args: { icon: <Factory aria-label="Supplier" />, children: "Lotus Manufacturing" }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing")).toBeVisible()
    await expect(canvas.getByLabelText("Supplier")).toBeInTheDocument()
  }
})

// A purchase order's route, stop by stop.
export const Route = meta.story({
  render: () => (
    <div className="flex items-center gap-2">
      <RoutePill icon={<Factory />}>Lotus Manufacturing</RoutePill>
      <RoutePill icon={<Ship />}>Bayline Freight</RoutePill>
      <RoutePill icon={<Warehouse />}>Harbor Goods warehouse, 400 Pier Avenue, Oakland, California 94607</RoutePill>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Bayline Freight")).toBeVisible()
    // A long stop is cut short rather than widening the route.
    await expect(canvas.getByText(/^Harbor Goods warehouse/)).toHaveClass("truncate")
  }
})
