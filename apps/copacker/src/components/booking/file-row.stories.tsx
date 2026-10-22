import { FileSpreadsheet, LinkIcon, Store, Tags, Truck } from "lucide-react"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { fileName } from "@/components/common"
import { dialogWidth } from "@/stories/booking"
import { agl, chestProtectors, fba } from "@/stories/fixtures/booking"
import { DownloadAction, FileRow, LabelsRow, OpenAction, RowStatus } from "./file-row"

const { file, sellerCentralUrl } = agl.start

const meta = preview.meta({
  title: "Unused/Booking/File row",
  component: FileRow,
  args: {
    icon: <FileSpreadsheet aria-hidden />,
    title: fileName(file.name, { title: file.name }),
    description: "100 units in 5 cartons",
    children: <DownloadAction href={file.href} />
  },
  decorators: [dialogWidth]
})

// A file ready to download: a link named for the file, as screen readers read it.
export const Download = meta.story({
  play: async ({ canvas }) => {
    const download = canvas.getByRole("link", { name: "Download PO36-Shipment-2-inventory.xlsx" })
    await expect(download).toHaveAttribute("href", "/api/shipments/ship_2/agl/inventory")
    await expect(download).toHaveAttribute("download")
    await expect(canvas.getByText("100 units in 5 cartons")).toBeVisible()
  }
})

// A place to go, opened in a new tab, which its description says.
export const OpenInANewTab = meta.story({
  args: {
    icon: <Store aria-hidden />,
    title: "Seller Central",
    description: "Choose Amazon Global Logistics, then upload the file",
    children: <OpenAction href={sellerCentralUrl} />
  },
  play: async ({ canvas }) => {
    const open = canvas.getByRole("link", { name: "Open Seller Central" })
    await expect(open).toHaveAttribute("target", "_blank")
    await expect(open).toHaveAttribute("rel", "noreferrer")
    await expect(open).toHaveAccessibleDescription("(opens in a new tab)")
  }
})

// A row that has reached a status instead of an action, such as the linked shipment.
export const WithAStatus = meta.story({
  args: {
    icon: <LinkIcon aria-hidden />,
    title: chestProtectors.name,
    description: "FBA18Z4K2QRL with 5 cartons and 100 units",
    children: <RowStatus>Linked</RowStatus>
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Linked")).toBeVisible()
    await expect(canvas.queryByRole("button")).toBeNull()
    await expect(canvas.queryByRole("link")).toBeNull()
  }
})

// Labels once they're here: Amazon's, counted, and a carrier's, which come uncounted. The supplier has them too.
export const Labels = meta.story({
  render: () => (
    <div className="flex flex-col gap-3">
      <LabelsRow icon={<Tags aria-hidden />} title="Carton labels" from="Amazon" labels={agl.linked.linked.labels} />
      <LabelsRow
        icon={<Truck aria-hidden />}
        title="Carrier labels"
        from={fba.booked.booked.carrierLabels.carrier}
        labels={fba.booked.booked.carrierLabels.labels}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("5 labels, shared with the supplier")).toBeVisible()
    await expect(canvas.getByText("From Amass, shared with the supplier")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Download Carton labels" })).toHaveAttribute(
      "href",
      "/api/shipments/ship_2/labels"
    )
    await expect(canvas.getByRole("link", { name: "Download Carrier labels" })).toBeVisible()
  }
})

// Labels still coming: a disabled button in Download's place says what it's waiting for, so nothing moves when they
// land.
export const GettingLabels = meta.story({
  render: () => (
    <LabelsRow
      icon={<Tags aria-hidden />}
      title="Carton labels"
      from="Amazon"
      labels={agl.gettingLabels.linked.labels}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Getting them from Amazon")).toBeVisible()
    const pending = canvas.getByRole("button", { name: "Getting labels" })
    await expect(pending).toBeDisabled()
    await expect(pending.querySelector("[data-slot=spinner]")).not.toBeNull()
    await expect(canvas.queryByRole("link")).toBeNull()
  }
})
