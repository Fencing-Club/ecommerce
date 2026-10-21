import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { PacketCatalog } from "./packet-catalog"
import { arrangementOptions, packetDataSets } from "./packet-data"
import { PacketSimulator } from "./packet-simulator"

const select = (options: readonly { value: string }[]) => ({
  control: "select" as const,
  options: options.map((option) => option.value)
})

const meta = preview.meta({
  title: "Simulators/Supplier packet",
  component: PacketSimulator,
  // A simulator is for trying the packet by hand, and it renders the whole packet, so test runs leave it out.
  tags: ["simulator", "documents"],
  // A data set or arrangement from the URL loads afresh.
  render: (args) => <PacketSimulator key={JSON.stringify(args)} {...args} />,
  argTypes: {
    dataSet: { control: "select", options: Object.keys(packetDataSets) },
    service: select(arrangementOptions.service),
    handoff: select(arrangementOptions.handoff),
    collection: select(arrangementOptions.collection),
    carrierLabels: select(arrangementOptions.carrierLabels)
  },
  parameters: { layout: "fullscreen" }
})

const productionExport = (canvas: ReturnType<typeof within>) =>
  canvas.getByRole("region", { name: "Production export" })
const checklist = (canvas: ReturnType<typeof within>) => within(canvas.getByRole("region", { name: "Checklist" }))

// Every line the checklist can print, from the checklist rules across the data sets and ways to ship them.
export const EveryChecklistLine = meta.story({
  render: () => <PacketCatalog />,
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table", { name: "Every checklist line" }))
    for (const section of ["Product preparation", "Carton requirements", "Pallets", "Handoff"]) {
      await expect(table.getByRole("rowheader", { name: section })).toBeVisible()
    }
    await expect(table.getAllByRole("row").length).toBeGreaterThan(20)
    await expect(table.getByText("Pallet labels")).toBeVisible()
  }
})

// The packet production exports for cartons to FBA by parcel, with every page.
export const Packet = meta.story({
  args: { dataSet: "fbaParcel" },
  play: async ({ canvas }) => {
    await expect(productionExport(canvas)).toHaveTextContent("Production exports this packet")
    await expect(checklist(canvas).getByText("Carrier label")).toBeVisible()
  }
})

// Pallets go by freight, which production's packet export doesn't take yet: the documents show what they would print.
export const FbaPallets = meta.story({
  name: "FBA on pallets",
  args: { dataSet: "fbaPallets" },
  play: async ({ canvas }) => {
    await expect(productionExport(canvas)).toHaveTextContent("Production can’t export this packet yet")
    await expect(checklist(canvas).getByText("Pallet labels")).toBeVisible()
    await expect(checklist(canvas).getByText("Bill of lading")).toBeVisible()
  }
})

export const AwdPallets = meta.story({
  name: "AWD on pallets",
  args: { dataSet: "awdPallets" },
  play: async ({ canvas }) => {
    await expect(checklist(canvas).queryByText("Pallet labels")).not.toBeInTheDocument()
  }
})

export const ThroughAForwarder = meta.story({
  name: "Through a forwarder",
  args: { dataSet: "fbaParcel", handoff: "forwarder" },
  play: async ({ canvas }) => {
    await expect(productionExport(canvas)).toHaveTextContent("Production can’t export this packet yet")
  }
})

// Every preparation and label a buyer can ask for, and a 3-pack, each a line of its product's group.
export const ProductRequirements = meta.story({
  args: { dataSet: "requirements" },
  play: async ({ canvas }) => {
    const lines = checklist(canvas)
    for (const line of [
      "Pack quantity",
      "Sealed polybag",
      "Polybag",
      "FNSKU label",
      "Buyer SKU label",
      "Country of origin label",
      "Suffocation warning",
      "Choking hazard label"
    ]) {
      await expect(lines.getAllByText(line).length).toBeGreaterThan(0)
    }
  }
})

export const BuyersWarehouse = meta.story({
  name: "Buyer's warehouse",
  args: { dataSet: "warehouse" },
  play: async ({ canvas }) => {
    await expect(checklist(canvas).queryByText("Carton label")).not.toBeInTheDocument()
    await expect(checklist(canvas).getByText("Carrier label")).toBeVisible()
  }
})
