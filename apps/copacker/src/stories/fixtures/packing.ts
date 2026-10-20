import type { Address, OrderInput, Packing, PackingDraft } from "@repo/aisle"
import { orderData, orderItem } from "./orders"

// Shipment 1 of PO38 from the 06 packing boards: Northwind Textiles packs three towels for Amazon AWD US, by way of
// Bayline Freight's Ningbo warehouse. Mei Chen is the factory's contact.
export const northwindFactory: Address = {
  name: "Mei Chen",
  phoneNumber: "+8657455550100",
  email: "",
  addressLine1: "88 Harbour Road",
  addressLine2: "",
  city: "Ningbo",
  stateOrRegion: "Zhejiang",
  postalCode: "315000",
  countryCode: "CN"
}

export const baylineWarehouse: Address = {
  name: "Bayline Freight",
  phoneNumber: "+865745550188",
  email: "",
  addressLine1: "18 Gangqiao Road",
  addressLine2: "Beilun",
  city: "Ningbo",
  stateOrRegion: "Zhejiang",
  postalCode: "315800",
  countryCode: "CN"
}

const towel = (variant: string, sku: string, pieces: number) =>
  orderItem({
    name: "Waffle bath towel",
    variant,
    buyerSku: `WB-${sku}`,
    supplierSku: `NT-WB-${sku}`,
    pieces,
    unitPrice: 640,
    asin: `B0WB${sku}00`,
    fnsku: `X0WB${sku}00`,
    amazonNetwork: "awd_us",
    packingRequirements: { preparation: "polybag", labels: ["fnsku", "suffocation"], countryCode: "", instructions: "" }
  })

export const towelOrder: OrderInput = orderData({
  reference: "PO38",
  destination: "amazon",
  deliveryId: undefined,
  via: { forwarderId: "9a7e3f1c-2b4d-4e6f-8a1b-2c3d4e5f6a02", addressId: "3c1a8f2e-0d4b-4c7a-9e21-5a6b7c8d9e02" },
  items: [
    towel("Natural / Large / 70 × 140 cm", "2210", 240),
    towel("Sage / Large / 70 × 140 cm", "2214", 180),
    orderItem({
      name: "Cotton tea towel (2 Pack)",
      variant: "Stripe / Cotton / 50 × 70 cm",
      buyerSku: "CT-3100",
      supplierSku: "NT-CT-3100",
      pieces: 120,
      piecesPerSet: 2,
      unitPrice: 310,
      asin: "B0CT310000",
      fnsku: "X0CT310000",
      amazonNetwork: "awd_us",
      suffocationWarning: false,
      packingRequirements: {
        preparation: "none",
        labels: ["sku", "fnsku", "choking"],
        countryCode: "",
        instructions: ""
      }
    })
  ]
})

// PO39 from the same boards: drawstring bags without a supplier SKU and a tea towel, sent to Amazon FBA US as individual
// units, so each carton can mix products.
const fbaLabels = { preparation: "none", labels: ["fnsku"], countryCode: "", instructions: "" } as const
const bag = (variant: string, sku: string, pieces: number) =>
  orderItem({
    name: "Cotton drawstring bag",
    variant,
    buyerSku: `DB-${sku}`,
    supplierSku: "",
    pieces,
    unitPrice: 180,
    asin: `B0DB${sku}00`,
    fnsku: `X0DB${sku}00`,
    amazonNetwork: "fba",
    packingRequirements: { ...fbaLabels, labels: [...fbaLabels.labels] }
  })

export const bagOrder: OrderInput = orderData({
  reference: "PO39",
  destination: "amazon",
  deliveryId: undefined,
  via: towelOrder.via,
  items: [
    bag("Sage / Medium / 20 × 30 cm", "2030", 60),
    bag("Natural / Medium / 20 × 30 cm", "2031", 45),
    orderItem({
      name: "Cotton tea towel",
      variant: "Stripe / 50 × 70 cm",
      buyerSku: "CT-3100",
      supplierSku: "NT-CT-3100",
      pieces: 75,
      unitPrice: 155,
      asin: "B0CT310001",
      fnsku: "X0CT310001",
      amazonNetwork: "fba",
      packingRequirements: { ...fbaLabels, labels: [...fbaLabels.labels] }
    })
  ]
})

// Three cartons of 60 × 40 × 40 cm at 12.4 kg, each mixing products, which pack all 180 units.
export function bagPacking(): Packing {
  const [sage, natural, teaTowel] = bagOrder.items
  const carton = (cartonId: string, items: Array<[{ id: string } | undefined, number]>) => ({
    cartonId,
    length: 60,
    width: 40,
    height: 40,
    weight: 12.4,
    items: items.map(([item, pieces]) => ({ itemId: item!.id, pieces }))
  })
  return {
    readyDate: "2026-10-20",
    origin: northwindFactory,
    cartons: [
      carton("1", [
        [sage, 40],
        [teaTowel, 40]
      ]),
      carton("2", [
        [natural, 30],
        [sage, 20],
        [teaTowel, 10]
      ]),
      carton("3", [
        [natural, 15],
        [teaTowel, 25]
      ])
    ],
    changes: []
  }
}

const [natural, sage, teaTowel] = towelOrder.items
// Identical cartons numbered from `from` to `to`, each holding the same product.
const cartonRange = (from: number, to: number, size: [number, number, number], itemId: string, pieces: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => ({
    cartonId: String(from + index),
    length: size[0],
    width: size[1],
    height: size[2],
    items: [{ itemId, pieces }]
  }))
const weighing = (weight: number) => (carton: ReturnType<typeof cartonRange>[number]) => ({ ...carton, weight })

// Cartons 1–10 and 17–18 are complete; cartons 11–16 have no weight yet and leave 36 Sage towels unpacked.
export function towelPackingDraft(): PackingDraft {
  return {
    readyDate: "2026-10-20",
    origin: northwindFactory,
    cartons: [
      ...cartonRange(1, 10, [60, 40, 40], natural!.id, 24).map(weighing(12.4)),
      ...cartonRange(11, 16, [60, 40, 50], sage!.id, 24),
      ...cartonRange(17, 18, [50, 35, 30], teaTowel!.id, 60).map(weighing(7.8))
    ],
    changes: []
  }
}

// Packing finished: cartons 11–16 weigh 15.2 kg and hold 30 each, so every unit is packed.
export function towelPacking(): Packing {
  return {
    readyDate: "2026-10-20",
    origin: northwindFactory,
    cartons: [
      ...cartonRange(1, 10, [60, 40, 40], natural!.id, 24).map(weighing(12.4)),
      ...cartonRange(11, 16, [60, 40, 50], sage!.id, 30).map(weighing(15.2)),
      ...cartonRange(17, 18, [50, 35, 30], teaTowel!.id, 60).map(weighing(7.8))
    ],
    changes: []
  }
}
