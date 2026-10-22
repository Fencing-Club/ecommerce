import type { ShippingDocumentData } from "../src/shipping-model"

// Fictional shipping documents, as the PDFs take them.
const supplier = { name: "Northwind Textiles", address: ["18 Textile Road", "Ningbo, Zhejiang 315800, China"] }
export const forwarder = {
  name: "Bayline Freight / Ningbo",
  address: ["88 Logistics Road", "Ningbo, Zhejiang 315800, China"]
}

// Two cartons of two products to FBA by parcel pickup, each with its Amazon and carrier label.
export const parcelShipment: ShippingDocumentData = {
  company: "Harbor Goods",
  order: "PO38",
  revision: 2,
  generatedDate: "2026-10-16",
  shipment: "DEMO-FBA-01",
  recipient: supplier,
  origin: supplier,
  destination: {
    name: "Amazon FBA / Example facility A",
    address: ["100 Warehouse Road", "Dallas, TX 75201, United States"]
  },
  network: "fba",
  transport: { service: "parcel", collection: "pickup", carrierLabels: true, palletized: false },
  products: [
    {
      id: "towel",
      supplierSku: "NT-WBT-NAT",
      description: "Waffle bath towel",
      variant: "Natural",
      piecesPerPack: 1,
      tasks: ["sealedPolybag", "fnsku"]
    },
    {
      id: "bag",
      supplierSku: "NT-CDB-SAG",
      description: "Cotton drawstring bag",
      variant: "Sage",
      piecesPerPack: 1,
      tasks: ["sealedPolybag", "fnsku"]
    }
  ],
  cartons: [1, 2].map((index) => ({
    id: `F${index}`,
    dimensions: [40, 40, 30],
    weight: 12.4,
    contents: [
      { productId: "towel", packs: 24 },
      { productId: "bag", packs: 12 }
    ],
    amazonLabel: `DEMO-FBA-01-BOX-0${index}`,
    carrierLabel: `DEMO-TRACK-0${index}`
  })),
  instructions: ""
}

// Twelve cartons of one product on one pallet, by freight from the supplier to FBA or AWD.
export function palletFreight(network: "fba" | "awd"): ShippingDocumentData {
  const shipment = network === "fba" ? "DEMO-FBA-03" : "DEMO-AWD-01"
  const cartonIds = Array.from({ length: 12 }, (_, index) => `${network === "fba" ? "F" : "A"}${index + 1}`)
  return {
    ...parcelShipment,
    network,
    shipment,
    products: [{ ...parcelShipment.products[0]!, tasks: [] }],
    transport: {
      service: "freight",
      collection: "pickup",
      carrierLabels: false,
      palletized: true,
      billOfLading: "DEMO-BOL-01"
    },
    cartons: cartonIds.map((id, index) => ({
      id,
      dimensions: [40, 40, 30],
      weight: 8,
      contents: [{ productId: "towel", packs: 12 }],
      amazonLabel: `DEMO-${network.toUpperCase()}-${String(index + 1).padStart(2, "0")}`
    })),
    pallets: [
      {
        id: "1",
        cartons: cartonIds,
        dimensions: [121.9, 101.6, 85],
        weight: 114,
        stackable: false,
        // Amazon labels FBA pallets only.
        ...(network === "fba" && { label: `${shipment} 1/1` })
      }
    ]
  }
}
