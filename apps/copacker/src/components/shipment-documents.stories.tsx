import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { ShipmentDocuments } from "./shipment-documents"
const meta = preview.meta({
  component: ShipmentDocuments,
  args: {
    documents: [
      { id: "packing", label: "Packing list" },
      { id: "carton", label: "Carton labels", unavailable: "Awaiting labels" }
    ],
    productLabels: [{ id: "fnsku", label: "FNSKU labels" }],
    onDownload: fn(),
    onProductDownload: fn()
  }
})
export const AwaitingLabels = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button", { name: "Download carton labels" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Download packing list" }))
    await expect(args.onDownload).toHaveBeenCalledWith("packing")
  }
})
export const Ready = meta.story({
  args: {
    documents: [
      { id: "packing", label: "Packing list" },
      { id: "carton", label: "Carton labels" },
      { id: "carrier", label: "Carrier labels" },
      { id: "reference", label: "Carton label reference" }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Download carrier labels" })).toBeEnabled()
  }
})
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Product labels" })).toBeVisible()
  }
})
