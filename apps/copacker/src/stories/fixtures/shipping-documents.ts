import type { ShippingDocumentData } from "@repo/copacker-shipments/shipping-model"

const supplier = { name: "Northwind Textiles", address: ["18 Textile Road", "Ningbo, Zhejiang 315800, China"] }
const forwarder = { name: "Bayline Freight / Ningbo", address: ["88 Logistics Road", "Ningbo, Zhejiang 315800, China"] }
const warehouse = {
  name: "Harbor Goods / Seattle",
  address: ["300 Receiving Avenue", "Seattle, WA 98108, United States"]
}
const depot = { name: "Parcel carrier / Ningbo depot", address: ["66 Cargo Road", "Ningbo, Zhejiang 315800, China"] }
const aglTransport: ShippingDocumentData["transport"] = {
  service: "agl",
  collection: "pickup",
  carrierLabels: false,
  palletized: false
}

// Fictional examples only: these are public Storybook documents, never operational labels.
const base: ShippingDocumentData = {
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

function palletFreight(network: "fba" | "awd"): ShippingDocumentData {
  const prefix = network === "fba" ? "F" : "A"
  const shipment = network === "fba" ? "DEMO-FBA-03" : "DEMO-AWD-01"
  const cartonIds = Array.from({ length: 12 }, (_, index) => `${prefix}${index + 1}`)
  return {
    ...base,
    network,
    shipment,
    destination:
      network === "fba"
        ? base.destination
        : {
            name: "Amazon AWD / Example facility",
            address: ["200 Distribution Road", "Hesperia, CA 92344, United States"]
          },
    products: [{ ...base.products[0]!, tasks: [] }],
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
      amazonLabel: `DEMO-${network.toUpperCase()}-${network === "fba" ? "BOX" : "SSCC"}-${String(index + 1).padStart(2, "0")}`
    })),
    pallets: [
      {
        id: "1",
        cartons: cartonIds,
        dimensions: [121.9, 101.6, 85],
        weight: 114,
        stackable: false,
        // Amazon labels FBA pallets only, with the Amazon shipment and the pallet's number in it.
        ...(network === "fba" && { label: `${shipment} 1/1` })
      }
    ]
  }
}
const fbaFreight = palletFreight("fba")
const awdFreight = palletFreight("awd")
const transfer: ShippingDocumentData = {
  ...awdFreight,
  network: "forwarder",
  destination: forwarder,
  onward: { destination: awdFreight.destination, service: "agl" },
  shipment: "DEMO-XFER-01",
  transport: { service: "supplier", collection: "delivery", carrierLabels: false, palletized: false },
  pallets: undefined,
  products: awdFreight.products.map((product) => ({ ...product, tasks: ["sealedPolybag"] })),
  cartons: awdFreight.cartons.map((carton, index) => ({ ...carton, id: `T${index + 1}`, amazonLabel: undefined }))
}
const forwarderAgl: ShippingDocumentData = {
  ...awdFreight,
  shipment: "DEMO-AWD-03",
  recipient: forwarder,
  origin: forwarder,
  transport: aglTransport,
  pallets: undefined,
  cartons: awdFreight.cartons.map((carton, index) => ({ ...carton, id: `T${index + 1}` })),
  receiving: {
    shipment: transfer.shipment,
    cartons: transfer.cartons.map((carton) => carton.id),
    repack: false,
    from: supplier
  }
}
const awd: ShippingDocumentData = {
  ...base,
  shipment: "DEMO-AWD-01",
  network: "awd",
  destination: {
    name: "Amazon AWD / Example facility B",
    address: ["200 Distribution Road", "Ontario, CA 91761, United States"]
  },
  transport: aglTransport,
  products: [
    {
      id: "towel",
      supplierSku: "NT-TT-2",
      description: "Cotton tea towel",
      variant: "Natural (2 pack)",
      piecesPerPack: 2,
      tasks: []
    }
  ],
  cartons: [1, 2, 3, 4].map((index) => ({
    id: `A${index}`,
    dimensions: [40, 40, 30],
    weight: 9.6,
    contents: [{ productId: "towel", packs: 60 }],
    amazonLabel: `DEMO-SSCC-00000000${index}`
  }))
}

export const shippingScenarios: { id: string; name: string; data: ShippingDocumentData }[] = [
  {
    id: "grouped-multipacks",
    name: "Grouped multipacks / Three carton groups",
    data: {
      ...awd,
      products: [
        {
          id: "natural",
          supplierSku: "NT-TT-NAT-2",
          description: "Cotton tea towel",
          variant: "Natural (2 pack)",
          piecesPerPack: 2,
          tasks: ["sealedPolybag"]
        },
        {
          id: "sage",
          supplierSku: "NT-TT-SAG-2",
          description: "Cotton tea towel",
          variant: "Sage (2 pack)",
          piecesPerPack: 2,
          tasks: ["sealedPolybag"]
        },
        {
          id: "stripe",
          supplierSku: "NT-TT-STR-2",
          description: "Cotton tea towel",
          variant: "Stripe (2 pack)",
          piecesPerPack: 2,
          tasks: ["sealedPolybag"]
        }
      ],
      cartons: Array.from({ length: 16 }, (_, index) => {
        let productId = "stripe"
        if (index < 5) {
          productId = "natural"
        } else if (index < 12) {
          productId = "sage"
        }
        return {
          id: `A${index + 1}`,
          dimensions: [40, 40, index < 12 ? 30 : 23],
          weight: index < 12 ? 19.6 : 12,
          contents: [{ productId, packs: index < 12 ? 80 : 150 }],
          amazonLabel: `DEMO-SSCC-${String(index + 1).padStart(8, "0")}`
        }
      })
    }
  },
  {
    id: "identical-cartons",
    name: "Large run of identical cartons",
    data: {
      ...base,
      cartons: Array.from({ length: 40 }, (_, index) => ({
        ...base.cartons[0]!,
        id: `F${index + 1}`,
        amazonLabel: `DEMO-FBA-01-BOX-${String(index + 1).padStart(3, "0")}`,
        carrierLabel: `DEMO-TRACK-${String(index + 1).padStart(3, "0")}`
      }))
    }
  },
  { id: "parcel-pickup", name: "FBA / Parcel pickup", data: base },
  {
    id: "mixed-cartons",
    name: "FBA / Mixed cartons",
    data: {
      ...base,
      shipment: "DEMO-FBA-05",
      products: [
        ...base.products,
        {
          id: "tea-towel",
          supplierSku: "NT-TT-NAT-2",
          description: "Cotton tea towel",
          variant: "Natural (2 pack)",
          piecesPerPack: 2,
          tasks: ["sealedPolybag", "fnsku"]
        },
        {
          id: "napkin",
          supplierSku: "NT-NPK-SAG-4",
          description: "Linen napkin",
          variant: "Sage (4 pack)",
          piecesPerPack: 4,
          tasks: ["sealedPolybag", "fnsku"]
        }
      ],
      // Three carton configurations, each holding several products.
      cartons: [
        ...[1, 2, 3].map((index) => ({
          id: `A${index}`,
          dimensions: [50, 40, 35] as [number, number, number],
          weight: 14.2,
          contents: [
            { productId: "towel", packs: 18 },
            { productId: "bag", packs: 12 },
            { productId: "tea-towel", packs: 10 }
          ]
        })),
        ...[1, 2].map((index) => ({
          id: `B${index}`,
          dimensions: [40, 40, 30] as [number, number, number],
          weight: 9.6,
          contents: [
            { productId: "tea-towel", packs: 20 },
            { productId: "napkin", packs: 15 }
          ]
        })),
        {
          id: "C1",
          dimensions: [40, 30, 25] as [number, number, number],
          weight: 6.8,
          contents: [
            { productId: "bag", packs: 16 },
            { productId: "napkin", packs: 10 },
            { productId: "towel", packs: 6 },
            { productId: "tea-towel", packs: 4 }
          ]
        }
      ].map((carton, index) => ({
        ...carton,
        amazonLabel: `DEMO-FBA-05-BOX-0${index + 1}`,
        carrierLabel: `DEMO-TRACK-1${index + 1}`
      }))
    }
  },
  {
    id: "parcel-dropoff",
    name: "FBA / Parcel drop-off",
    data: {
      ...base,
      shipment: "DEMO-FBA-02",
      transport: { ...base.transport, collection: "dropoff", dropoffAddress: depot },
      cartons: base.cartons.map((carton, index) => ({
        ...carton,
        amazonLabel: `DEMO-FBA-02-BOX-0${index + 1}`,
        carrierLabel: `DEMO-TRACK-0${index + 3}`
      }))
    }
  },
  {
    id: "fba-freight",
    name: "FBA / Pallet freight",
    data: fbaFreight
  },
  {
    id: "awd-freight",
    name: "AWD / Pallet freight",
    data: awdFreight
  },
  {
    id: "agl-fba",
    name: "FBA / AGL pickup",
    data: {
      ...base,
      shipment: "DEMO-FBA-04",
      transport: { ...awd.transport },
      cartons: base.cartons.map((carton, index) => ({
        ...carton,
        amazonLabel: `DEMO-FBA-04-BOX-0${index + 1}`,
        carrierLabel: undefined
      }))
    }
  },
  { id: "agl-awd", name: "AWD / AGL pickup", data: awd },
  {
    id: "warehouse",
    name: "Own warehouse / Carrier pickup",
    data: {
      ...base,
      network: "warehouse",
      destination: warehouse,
      shipment: "DEMO-WH-01",
      cartons: base.cartons.map((carton, index) => ({
        ...carton,
        id: `W${index + 1}`,
        amazonLabel: undefined,
        carrierLabel: `DEMO-CARRIER-0${index + 1}`
      }))
    }
  },
  {
    id: "supplier-transfer",
    name: "Supplier delivers to forwarder",
    data: transfer
  },
  {
    id: "forwarder-pickup",
    name: "Forwarder collects from supplier",
    data: {
      ...forwarderAgl,
      origin: supplier,
      recipient: supplier,
      receiving: undefined,
      stops: [forwarder],
      shipment: "DEMO-AWD-02",
      transport: {
        service: "forwarder",
        collection: "pickup",
        carrierLabels: false,
        palletized: false,
        providerName: "Bayline Freight"
      }
    }
  },
  {
    id: "forwarder-agl",
    name: "AGL collects from forwarder",
    data: forwarderAgl
  },
  {
    id: "forwarder-repack",
    name: "Forwarder repacks for AGL",
    data: {
      ...forwarderAgl,
      shipment: "DEMO-AWD-04",
      receiving: { ...forwarderAgl.receiving!, repack: true },
      cartons: Array.from({ length: 6 }, (_, index) => ({
        id: `R${index + 1}`,
        dimensions: [60, 40, 35],
        weight: 16.5,
        contents: [{ productId: "towel", packs: 24 }],
        amazonLabel: `DEMO-AWD-NEW-0${index + 1}`
      }))
    }
  },
  {
    id: "long-order",
    name: "Multiple pages / 40 cartons",
    data: {
      ...base,
      cartons: Array.from({ length: 40 }, (_, index) => ({
        id: `F${index + 1}`,
        dimensions: [40, 40, 30],
        weight: 10 + Math.floor(index / 2) * 0.1,
        contents: [
          { productId: "towel", packs: 24 },
          { productId: "bag", packs: 12 }
        ],
        amazonLabel: `DEMO-FBA-01-BOX-${String(index + 1).padStart(3, "0")}`,
        carrierLabel: `DEMO-TRACK-${String(index + 1).padStart(3, "0")}`
      }))
    }
  },
  {
    id: "missing-label",
    name: "Missing carrier assignment",
    data: { ...base, cartons: base.cartons.map((carton) => ({ ...carton, carrierLabel: undefined })) }
  },
  {
    id: "markdown",
    name: "Buyer instructions / Markdown",
    data: {
      ...base,
      instructions:
        "**Before pickup**\n\n- Keep the shipment together.\n- Take a photo of each labelled carton.\n\n1. Count all cartons.\n2. Share the final packing list."
    }
  }
]

export const shippingOverview = [base, awdFreight]
