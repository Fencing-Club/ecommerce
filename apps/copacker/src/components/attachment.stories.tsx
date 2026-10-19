import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Attachment } from "./attachment"
const meta = preview.meta({
  title: "Components/Display/Attachment",
  component: Attachment,
  args: {
    label: "Packing list",
    fileName: "PO36-Shipment-2-Packing-list.pdf",
    downloadLabel: "Download packing list",
    onDownload: fn()
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    )
  ]
})
export const Default = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Download packing list" }))
    await expect(args.onDownload).toHaveBeenCalled()
  }
})
export const StoredFile = meta.story({
  args: { href: "/api/documents/packing-list" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Download packing list" })).toHaveAttribute(
      "href",
      "/api/documents/packing-list"
    )
  }
})
export const Busy = meta.story({
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Download packing list" })).toBeDisabled()
  }
})

export const Packet = meta.story({
  args: {
    kind: "packet",
    label: "Shipment packet",
    description: "All shipment documents",
    fileName: undefined,
    downloadLabel: "Download shipment packet"
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Download shipment packet" }))
    await expect(args.onDownload).toHaveBeenCalled()
  }
})
