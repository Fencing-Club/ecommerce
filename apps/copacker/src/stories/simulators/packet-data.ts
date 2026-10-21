import { packingSchema, palletLabels } from "@repo/aisle"
import type { CartonLabel } from "@repo/aisle/labels"
import type { PackingRequirements } from "@repo/aisle/packing-requirements"
import type { ShipmentTransport } from "@repo/aisle/transport"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import type { DocumentParty, ShippingDocumentData } from "@/documents/shipping-model"
import { packingListSnapshot, shippingDocumentSnapshot } from "@/documents/shipping-snapshot"
import type { PacketLabels } from "@/documents/supplier-packet"
import { type CartonGroup, expandCartonGroups, type PalletValue } from "@/lib/carton-groups"
import { cartonGroup, palletCartonSet, palletDataSets, type Receiver, simulatorOrder, simulatorOrigin } from "./data"

// How a shipment travels, as the shipment's transport arrangement records it.
export type Arrangement = Pick<ShipmentTransport, "service" | "handoff" | "collection" | "carrierLabels">
export const arrangementOptions = {
  service: [
    { value: "parcel", label: "Parcel carrier" },
    { value: "agl", label: "Amazon Global Logistics" },
    { value: "freight", label: "Freight carrier" }
  ],
  handoff: [
    { value: "supplier", label: "From the supplier" },
    { value: "forwarder", label: "Through a forwarder" }
  ],
  collection: [
    { value: "pickup", label: "Pickup" },
    { value: "dropoff", label: "Drop-off" }
  ],
  carrierLabels: [
    { value: "per_carton", label: "One a carton" },
    { value: "none", label: "None" }
  ]
} as const satisfies { [Key in keyof Arrangement]: readonly { value: Arrangement[Key]; label: string }[] }

// A shipment for the packet: its cartons, and pallets when they ship on pallets, for the receiver it names, with how it
// usually ships and the packing requirements of the products it changes, by buyer SKU.
type PacketDataSet = {
  name: string
  receiver: Exclude<Receiver, "mixed">
  cartons: CartonGroup[]
  pallets?: PalletValue[]
  note: string
  arrangement: Arrangement
  requirements?: Record<string, PackingRequirements>
}

const bags = cartonGroup(["A1", "A2", "A3", "A4"], [60, 40, 40], 12, [["natural", 40]])
const mixed = cartonGroup(["B1"], [60, 40, 40], 12.4, [
  ["sage", 40],
  ["stripe", 40]
])
const parcel: Arrangement = {
  service: "parcel",
  handoff: "supplier",
  collection: "pickup",
  carrierLabels: "per_carton"
}
const agl: Arrangement = { service: "agl", handoff: "supplier", collection: "pickup", carrierLabels: "none" }
const freight: Arrangement = { service: "freight", handoff: "supplier", collection: "pickup", carrierLabels: "none" }

export const packetDataSets = {
  fbaParcel: {
    name: "FBA by parcel",
    receiver: "fba",
    note: "Four cartons of bags and one mixing two SKUs, each with Amazon's label and the parcel carrier's.",
    cartons: [bags, mixed],
    arrangement: parcel
  },
  fbaAgl: {
    name: "FBA by AGL",
    receiver: "fba",
    note: "The same cartons, collected by Amazon Global Logistics: Amazon's labels only.",
    cartons: [bags, mixed],
    arrangement: agl
  },
  fbaPallets: {
    name: "FBA on pallets",
    receiver: "fba",
    note: "Twelve cartons of bags on two pallets, by freight. Amazon labels each pallet on all four sides.",
    cartons: palletCartonSet,
    pallets: palletDataSets.withinLimits.pallets,
    arrangement: freight
  },
  awdAgl: {
    name: "AWD by AGL",
    receiver: "awd_us",
    note: "Four cartons of one SKU, packed alike, as AWD takes them.",
    cartons: [bags],
    arrangement: agl
  },
  awdPallets: {
    name: "AWD on pallets",
    receiver: "awd_us",
    note: "Twelve cartons on two pallets, by freight. AWD asks for pallet labels only from its partnered carriers.",
    cartons: palletCartonSet,
    pallets: palletDataSets.withinLimits.pallets,
    arrangement: freight
  },
  warehouse: {
    name: "Buyer's warehouse",
    receiver: "warehouse",
    note: "The buyer's own warehouse: no Amazon labels, only the parcel carrier's.",
    cartons: [bags, mixed],
    arrangement: parcel
  },
  warehousePallets: {
    name: "Buyer's warehouse on pallets",
    receiver: "warehouse",
    note: "Twelve cartons on two pallets, by freight: the general loading and securing steps, with no pallet labels.",
    cartons: palletCartonSet,
    pallets: palletDataSets.withinLimits.pallets,
    arrangement: freight
  },
  requirements: {
    name: "Product requirements",
    receiver: "fba",
    note: "Products the buyer asks to bag, label and mark: every preparation and label, and a 3-pack.",
    cartons: [
      cartonGroup(["A1"], [60, 40, 40], 12, [["natural", 40]]),
      cartonGroup(["B1"], [60, 40, 40], 12, [["sage", 40]]),
      cartonGroup(["C1"], [60, 40, 40], 12, [["stripe", 40]]),
      cartonGroup(["E1"], [50, 40, 30], 6, [["threePack", 30]])
    ],
    arrangement: parcel,
    requirements: {
      "DB-2031": { preparation: "sealedPolybag", labels: ["fnsku", "suffocation"], countryCode: "", instructions: "" },
      "DB-2030": { preparation: "polybag", labels: ["fnsku", "choking"], countryCode: "", instructions: "" },
      "CT-3100": {
        preparation: "none",
        labels: ["sku", "countryOfOrigin"],
        countryCode: "CN",
        instructions: "Fold each towel in thirds before it goes in the carton."
      },
      "CT-3102": { preparation: "none", labels: ["fnsku"], countryCode: "", instructions: "" }
    }
  }
} satisfies Record<string, PacketDataSet>
export type PacketDataSetId = keyof typeof packetDataSets
export const isPacketDataSet = (id: string): id is PacketDataSetId => id in packetDataSets

// Fictional places only: these are public Storybook documents, never operational ones.
const destinations: Record<PacketDataSet["receiver"], DocumentParty> = {
  fba: { name: "Amazon FBA / Example facility A", address: ["100 Warehouse Road", "Dallas, TX 75201", "US"] },
  awd_us: { name: "Amazon AWD / Example facility B", address: ["200 Distribution Way", "Reno, NV 89506", "US"] },
  warehouse: { name: "Harbor Goods / Seattle", address: ["300 Receiving Avenue", "Seattle, WA 98108", "US"] }
}

// A packet as production would export it, and why production refuses to when it does.
type SimulatedPacket = { data: ShippingDocumentData; refusal?: string }

// The packet for a data set shipped as arranged: production's own snapshot, with a sample Amazon label for every carton
// to Amazon and a carrier label for each when the carrier labels cartons. When the snapshot refuses the shipment, the
// documents still show what they would print, built as production builds the packing list, with the labels and address
// the packet adds.
export function simulatePacket(set: PacketDataSet, arrangement: Arrangement): SimulatedPacket {
  const base = simulatorOrder(set.receiver)
  const order = {
    ...base,
    // An accepted PO has the supplier's own SKU on every line, which the packet lists products by.
    items: base.items.map((item) => ({
      ...item,
      supplierSku: item.supplierSku || `NT-${item.buyerSku}`,
      packingRequirements: set.requirements?.[item.buyerSku] ?? item.packingRequirements
    }))
  }
  const packing = packingSchema.parse({
    readyDate: "2026-10-27",
    origin: simulatorOrigin,
    cartons: expandCartonGroups(set.cartons),
    changes: [],
    ...(set.pallets && { palletized: true, pallets: set.pallets })
  })
  const amazonShipment = set.receiver === "awd_us" ? "STAR-SIM0001" : "FBA19SIM0001"
  const labels: CartonLabel[] =
    order.destination === "amazon"
      ? packing.cartons.map((carton, index) => ({
          cartonId: carton.cartonId,
          labelNumber: `${amazonShipment}U${String(index + 1).padStart(6, "0")}`,
          destinationCode: "SIM1",
          amazonShipmentId: amazonShipment
        }))
      : []
  const carrierLabels =
    arrangement.carrierLabels === "per_carton"
      ? packing.cartons.map((carton, index) => ({
          cartonId: carton.cartonId,
          labelNumber: `1ZSIM${String(index + 1).padStart(10, "0")}`
        }))
      : []
  const input = {
    order,
    packing,
    labels,
    carrierLabels,
    transport: { ...arrangement, instructions: "" },
    company: "Harbor Goods",
    supplier: "Northwind Textiles",
    destination: destinations[set.receiver],
    revision: 1,
    shipmentId: order.destination === "amazon" ? amazonShipment : "SIM-0001",
    generatedDate: "2026-10-20"
  }
  try {
    return { data: shippingDocumentSnapshot(input) }
  } catch (error) {
    const list = packingListSnapshot({ ...input, destination: input.destination.name })
    const placed = list.network === "fba" ? palletLabels(packing.pallets ?? [], labels) : []
    return {
      refusal: error instanceof Error ? error.message : String(error),
      data: {
        ...list,
        destination: input.destination,
        ...(list.pallets && {
          pallets: list.pallets.map((pallet) => {
            const label = placed.find((row) => row.palletId === pallet.id)
            return label ? { ...pallet, label: `${label.amazonShipmentId} ${label.number}/${label.count}` } : pallet
          })
        }),
        cartons: list.cartons.map((carton) => ({
          ...carton,
          amazonLabel: labels.find((label) => label.cartonId === carton.id)?.labelNumber,
          carrierLabel: carrierLabels.find((label) => label.cartonId === carton.id)?.labelNumber
        }))
      }
    }
  }
}

// A sample label file: a page for each label, in its provider's page size, each a bordered box naming the label it
// stands in for. Nothing is filled, so the packet's pages show where each label goes without passing for a real one.
async function labelFile(size: [number, number], fontSize: number, pages: string[][]) {
  if (!pages.length) {
    return undefined
  }
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const margin = Math.round(fontSize / 2)
  for (const lines of pages) {
    const page = pdf.addPage(size)
    page.drawRectangle({
      x: margin,
      y: margin,
      width: size[0] - margin * 2,
      height: size[1] - margin * 2,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 1
    })
    for (const [index, line] of lines.entries()) {
      const lineSize = index === 0 ? fontSize * 0.7 : fontSize
      page.drawText(line, {
        x: margin * 2,
        y: size[1] - margin * 2 - fontSize * (index + 1) * 1.4,
        size: lineSize,
        font,
        color: rgb(0.2, 0.2, 0.2)
      })
    }
  }
  return pdf.save()
}

// Sample labels for a packet, as production fetches them: Amazon's carton labels and the carrier's on 4 × 6 in pages,
// Amazon's pallet labels on Letter paper, four a pallet, one for each side, and a 2 × 1 in product label for each product
// the buyer asks to label.
export async function sampleLabels(data: ShippingDocumentData): Promise<PacketLabels> {
  const files = await Promise.all([
    labelFile(
      [288, 432],
      16,
      data.cartons.flatMap((carton) =>
        carton.amazonLabel ? [["Sample Amazon carton label", `Carton ${carton.id}`, carton.amazonLabel]] : []
      )
    ),
    labelFile(
      [288, 432],
      16,
      data.cartons.flatMap((carton) =>
        carton.carrierLabel ? [["Sample carrier label", `Carton ${carton.id}`, carton.carrierLabel]] : []
      )
    ),
    labelFile(
      [612, 792],
      28,
      (data.pallets ?? []).flatMap(({ id, label }) =>
        label
          ? [1, 2, 3, 4].map((side) => ["Sample Amazon pallet label", `Pallet ${id}`, label, `Side ${side} of 4`])
          : []
      )
    ),
    labelFile(
      [144, 72],
      9,
      data.products.flatMap((product) =>
        product.tasks.some((task) => task === "fnsku" || task === "sku")
          ? [["Sample product label", product.supplierSku]]
          : []
      )
    )
  ])
  const [carton, carrier, pallet, product] = files
  return {
    ...(carton && { carton: [carton] }),
    ...(carrier && { carrier: [carrier] }),
    ...(pallet && { pallet: [pallet] }),
    ...(product && { product: [product] })
  }
}
