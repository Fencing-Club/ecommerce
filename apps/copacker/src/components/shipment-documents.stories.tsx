import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { ShipmentDetails } from "./shipment-details"
import { ShipmentDocuments } from "./shipment-documents"
const meta = preview.meta({
  title: "Unused/Shipments/Shipment documents",
  component: ShipmentDocuments,
  render: (args) => (
    <aside className="w-full max-w-80 space-y-6">
      <ShipmentDocuments {...args} />
      <ShipmentDetails readyDate="2026-10-21" cartons={5} weight={34.5} volume={0.53} />
    </aside>
  ),
  args: {
    documents: [{ id: "packing", label: "Packing list" }],
    productLabels: [{ id: "fnsku", label: "FNSKU labels" }],
    onDownload: fn(),
    onProductDownload: fn()
  }
})
export const AwaitingLabels = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.queryByRole("button", { name: "Download carton labels" })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Download packing list" }))
    await expect(args.onDownload).toHaveBeenCalledWith("packing")
  }
})
export const Ready = meta.story({
  args: {
    onDownloadPacket: fn(),
    documents: [
      { id: "packing", label: "Packing list" },
      { id: "carton", label: "Carton labels" },
      { id: "carrier", label: "Carrier labels" },
      { id: "checklist", label: "Packing checklist" },
      { id: "reference", label: "Carton label reference" }
    ]
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button", { name: "Download carrier labels" })).toBeEnabled()
    await expect(canvas.getByRole("button", { name: "Download packing checklist" })).toBeEnabled()
    await userEvent.click(canvas.getByRole("button", { name: "Download shipment packet" }))
    await expect(args.onDownloadPacket).toHaveBeenCalled()
  }
})
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Download FNSKU labels" })).toBeVisible()
  }
})

export const Packing = meta.story({
  args: { documents: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Download FNSKU labels" })).toBeVisible()
    await expect(canvas.queryByText("Packing list")).not.toBeInTheDocument()
  }
})

export const MultipleProductLabels = meta.story({
  args: {
    productLabels: [
      { id: "fnsku", label: "FNSKU labels" },
      { id: "suffocation", label: "Suffocation warning labels" }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Product labels" })).toHaveAttribute("aria-haspopup", "menu")
  }
})
export const SingleProductLabel = meta.story({
  args: { documents: [] },
  play: async ({ canvas, args }) => {
    const download = canvas.getByRole("button", { name: "Download FNSKU labels" })
    await expect(download).not.toHaveAttribute("aria-haspopup")
    await userEvent.click(download)
    await expect(args.onProductDownload).toHaveBeenCalledWith(["fnsku"])
  }
})
