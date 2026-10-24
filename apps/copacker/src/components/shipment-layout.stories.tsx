import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ShipmentLayout } from "./shipment-layout"

// A stand-in for what the page puts in each place, named for the play tests.
function Slot({ name, children }: { name: string; children?: React.ReactNode }) {
  return (
    <section aria-label={name} className="rounded-lg border border-dashed p-4 text-muted-foreground">
      {name}
      {children}
    </section>
  )
}

const meta = preview.meta({
  title: "Components/Shipments/Shipment layout",
  component: ShipmentLayout,
  args: {
    header: (
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Shipment 1</h1>
        <Button type="button">Header action</Button>
      </div>
    ),
    notices: <Slot name="Notices" />,
    details: <Slot name="Details" />,
    products: <Slot name="Products" />,
    sidebar: <Slot name="Documents and totals" />,
    children: (
      <Slot name="Cartons">
        <Button type="button" variant="outline" className="ms-3">
          Add carton
        </Button>
      </Slot>
    )
  },
  // The slots take elements, which aren't something to edit in the Controls panel.
  argTypes: Object.fromEntries(
    ["header", "notices", "details", "products", "sidebar", "children"].map((slot) => [slot, { control: false }])
  )
})

const regions = (canvas: HTMLElement) =>
  [...canvas.querySelectorAll("section[aria-label]")].map((region) => region.getAttribute("aria-label"))

// The column holds the notices, details, products and then the cartons, with the documents and totals beside it.
export const Default = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(regions(canvasElement)).toEqual(["Notices", "Details", "Products", "Cartons", "Documents and totals"])
    await expect(canvas.getByRole("complementary")).toHaveTextContent("Documents and totals")
    await expect(canvas.getByRole("button", { name: "Add carton" })).toBeEnabled()
  }
})

// While packing saves, the column and sidebar are disabled, but not the header.
export const Busy = meta.story({
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add carton" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Header action" })).toBeEnabled()
  }
})

// Without a sidebar the column takes the page.
export const WithoutSidebar = meta.story({
  args: { sidebar: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("complementary")).toBeNull()
  }
})
