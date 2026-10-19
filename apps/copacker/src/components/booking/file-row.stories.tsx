import { Check, FileSpreadsheet, LinkIcon, Store, Tags } from "lucide-react"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { fileName, StatusBadge } from "@/components/common"
import { DownloadAction, FileRow, OpenAction } from "./file-row"

const meta = preview.meta({
  component: FileRow,
  args: {
    icon: <FileSpreadsheet aria-hidden />,
    title: fileName("PO36-Shipment-2-inventory.xlsx", { title: "PO36-Shipment-2-inventory.xlsx" }),
    description: "100 units in 5 cartons",
    children: <DownloadAction href="/api/shipments/ship_2/agl/inventory" />
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    )
  ]
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

// A file still coming: a disabled button in Download's place says what it's waiting for, so nothing moves when it
// lands.
export const GettingTheFile = meta.story({
  args: {
    icon: <Tags aria-hidden />,
    title: "Carton labels",
    description: "Getting them from Amazon",
    children: <DownloadAction pending="Getting labels" />
  },
  play: async ({ canvas }) => {
    const pending = canvas.getByRole("button", { name: "Getting labels" })
    await expect(pending).toBeDisabled()
    await expect(pending.querySelector("[data-slot=spinner]")).not.toBeNull()
    await expect(canvas.queryByRole("link")).toBeNull()
  }
})

// A place to go, opened in a new tab, which its description says.
export const OpenInANewTab = meta.story({
  args: {
    icon: <Store aria-hidden />,
    title: "Seller Central",
    description: "Choose Amazon Global Logistics, then upload the file",
    children: <OpenAction href="https://sellercentral.amazon.com/fba/sendtoamazon" />
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
    title: "PO36 / Chest protectors",
    description: "FBA18Z4K2QRL with 5 cartons and 100 units",
    children: (
      <StatusBadge tone="success" icon={<Check aria-hidden />}>
        Linked
      </StatusBadge>
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Linked")).toBeVisible()
    await expect(canvas.queryByRole("button")).toBeNull()
    await expect(canvas.queryByRole("link")).toBeNull()
  }
})
