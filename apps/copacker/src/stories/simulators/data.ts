import type { OrderInput, OrderItem } from "@repo/copacker-orders"
import type { AmazonNetwork } from "@repo/copacker-packing-rules"
import type { Packing } from "@repo/copacker-shipments"
import type { CartonGroup, PalletValue } from "@/lib/carton-groups"
import { orderData, orderItem } from "@/stories/fixtures/orders"
import { towelOrder } from "@/stories/fixtures/packing"
import { northwindFactory } from "@/stories/fixtures/parties"

// Sample data for the simulators: one PO's products, sent wherever the simulator says, and the carton and pallet sets
// that put the real rules to work. The rules themselves come from @repo/copacker-shipments; nothing here restates a limit.

// Where the cartons go: an Amazon network, both networks at once (which a carton may not mix), or the buyer's own
// warehouse, which takes any carton.
export const receivers = ["fba", "awd_us", "mixed", "warehouse"] as const
export type Receiver = (typeof receivers)[number]
export const receiverNames: Record<Receiver, string> = {
  fba: "Amazon FBA",
  awd_us: "Amazon AWD US",
  mixed: "FBA and AWD US products",
  warehouse: "Buyer's warehouse"
}

const labels = { preparation: "none", labels: ["fnsku"], countryCode: "", instructions: "" } as const
const product = (overrides: Partial<OrderItem>) =>
  orderItem({
    supplierSku: "",
    unitPrice: 180,
    prepCategory: "NO_PREP",
    suffocationWarning: false,
    packingRequirements: { ...labels, labels: [...labels.labels] },
    ...overrides
  })

// The PO's products, each with the units the PO orders. The table runners have no FNSKU yet, the tea towel 3-packs come
// in sets of three, and a floor cushion is one large, heavy unit.
const products = {
  natural: product({
    name: "Cotton drawstring bag",
    variant: "Natural",
    buyerSku: "DB-2031",
    pieces: 400,
    asin: "B0DB203100",
    fnsku: "X0DB203100"
  }),
  sage: product({
    name: "Cotton drawstring bag",
    variant: "Sage",
    buyerSku: "DB-2030",
    pieces: 80,
    asin: "B0DB203000",
    fnsku: "X0DB203000"
  }),
  stripe: product({
    name: "Cotton tea towel",
    variant: "Stripe",
    buyerSku: "CT-3100",
    supplierSku: "NT-CT-3100",
    pieces: 80,
    asin: "B0CT310001",
    fnsku: "X0CT310001"
  }),
  ivory: product({
    name: "Cotton tea towel",
    variant: "Ivory",
    buyerSku: "CT-3101",
    pieces: 240,
    asin: "B0CT310101",
    fnsku: "X0CT310101"
  }),
  threePack: product({
    name: "Cotton tea towel",
    variant: "3-pack",
    buyerSku: "CT-3102",
    pieces: 90,
    piecesPerSet: 3,
    asin: "B0CT310201",
    fnsku: "X0CT310201"
  }),
  napkin: product({
    name: "Linen napkin",
    variant: "Oat",
    buyerSku: "LN-4000",
    pieces: 60,
    asin: "B0LN400000",
    fnsku: "X0LN400000"
  }),
  runner: product({
    name: "Linen table runner",
    variant: "Oat",
    buyerSku: "LN-4100",
    pieces: 60,
    asin: "B0LN410000",
    fnsku: ""
  }),
  cushion: product({
    name: "Floor cushion",
    variant: "Charcoal / 100 × 100 cm",
    buyerSku: "FC-5000",
    pieces: 4,
    asin: "B0FC500000",
    fnsku: "X0FC500000"
  })
}
export type ProductKey = keyof typeof products

// The PO, sent to the receiver. With both networks, the bags go to FBA and the tea towels to AWD.
export function simulatorOrder(receiver: Receiver): OrderInput {
  const network = (key: ProductKey): AmazonNetwork => {
    if (receiver === "mixed") {
      return ["natural", "sage", "napkin", "runner", "cushion"].includes(key) ? "fba" : "awd_us"
    }
    return receiver === "awd_us" ? "awd_us" : "fba"
  }
  return orderData({
    reference: "PO39",
    destination: receiver === "warehouse" ? "warehouse" : "amazon",
    deliveryId: receiver === "warehouse" ? towelOrder.deliveryId : undefined,
    items: (Object.keys(products) as ProductKey[]).map((key) => ({ ...products[key], receiver: network(key) }))
  })
}

// The PO with plenty of every product, so breaking one rule breaks no other.
export function catalogOrder(receiver: Receiver): OrderInput {
  const order = simulatorOrder(receiver)
  return { ...order, items: order.items.map((item) => ({ ...item, pieces: 100000 })) }
}

// The PO a data set packs, sent to the receiver: the units it orders, or plenty of every product.
export const dataSetOrder = (plenty: boolean | undefined, receiver: Receiver) =>
  (plenty ? catalogOrder : simulatorOrder)(receiver)

// A product no PO lists, for the rules on what a carton holds.
export const unknownItemId = "7d1f0c2a-4b3e-4f5a-8c6d-999999999999"

// A carton group: its IDs, size in cm, weight in kg, and each product's units per carton.
export function cartonGroup(
  ids: string[],
  size: [number, number, number],
  weight: number,
  contents: [ProductKey, number][]
): CartonGroup {
  return {
    cartonId: ids[0]!,
    cartonIds: ids,
    count: ids.length,
    length: size[0],
    width: size[1],
    height: size[2],
    weight,
    items: contents.map(([key, pieces]) => ({ itemId: products[key].id, pieces }))
  }
}

// A set of cartons for the receiver it names. `plenty` packs them against a PO with plenty of every product,
// `changes` are the invoice changes they come with, and `packingGroups` Amazon's packing groups by SKU, once Amazon has
// set them.
export type CartonDataSet = {
  name: string
  receiver: Receiver
  cartons: CartonGroup[]
  note: string
  plenty?: boolean
  changes?: Packing["changes"]
  packingGroups?: Record<string, string>
}

// Each set shows a rule at work, or holds within it, for the receiver it names.
export const cartonDataSets = {
  withinLimits: {
    name: "Within every limit",
    receiver: "fba",
    note: "Standard cartons, one mixing two SKUs, which FBA allows.",
    cartons: [
      cartonGroup(["A1", "A2", "A3", "A4"], [60, 40, 40], 12, [["natural", 40]]),
      cartonGroup(["B1"], [60, 40, 40], 12.4, [
        ["sage", 40],
        ["stripe", 40]
      ])
    ]
  },
  fbaSize: {
    name: "FBA size and weight",
    receiver: "fba",
    note: "A1–A2 are 100 cm long and 25 kg. B1 fits 36 × 25 × 25 in lying either way; B2 is 70 cm wide, over 25 in.",
    cartons: [
      cartonGroup(["A1", "A2"], [100, 40, 40], 25, [["natural", 160]]),
      cartonGroup(["B1"], [63, 91, 60], 20, [["ivory", 120]]),
      cartonGroup(["B2"], [80, 70, 40], 18, [["ivory", 100]])
    ]
  },
  fbaSingleUnit: {
    name: "FBA single oversize unit",
    receiver: "fba",
    note: "C1 holds one floor cushion, so it may be larger and heavier. C2 holds two, so the limits apply.",
    cartons: [
      cartonGroup(["C1"], [110, 105, 30], 26, [["cushion", 1]]),
      cartonGroup(["C2"], [110, 105, 60], 52, [["cushion", 2]])
    ]
  },
  awdLimits: {
    name: "AWD units, size and weight",
    receiver: "awd_us",
    note: "A1–A2 hold 160 units, are 70 cm long and 25 kg: over AWD's 150 units, 25 in and 50 lb. AWD has no single-unit exception.",
    cartons: [
      cartonGroup(["A1", "A2"], [70, 40, 40], 25, [["natural", 160]]),
      cartonGroup(["C1"], [110, 105, 30], 26, [["cushion", 1]])
    ]
  },
  awdMixed: {
    name: "AWD mixed SKUs",
    receiver: "awd_us",
    note: "B1 mixes two SKUs, which AWD doesn't allow.",
    cartons: [
      cartonGroup(["B1"], [60, 40, 40], 12.4, [
        ["sage", 40],
        ["stripe", 40]
      ])
    ]
  },
  awdTemplate: {
    name: "AWD packing template",
    receiver: "awd_us",
    note: "C1 packs 120 Ivory tea towels and C2 100: every carton of a SKU must match its first.",
    cartons: [
      cartonGroup(["C1"], [60, 40, 40], 12.4, [["ivory", 120]]),
      cartonGroup(["C2"], [60, 40, 40], 12.4, [["ivory", 100]])
    ]
  },
  identifiers: {
    name: "Missing FNSKU",
    receiver: "fba",
    note: "The napkins in D1 have their FNSKU on the PO, and the table runners in D2 don't.",
    cartons: [
      cartonGroup(["D1"], [50, 40, 30], 8, [["napkin", 60]]),
      cartonGroup(["D2"], [50, 40, 30], 8, [["runner", 60]])
    ]
  },
  multipacks: {
    name: "Incomplete multi-packs",
    receiver: "fba",
    note: "The tea towel 3-pack comes in sets of three; E1 holds 10 pieces.",
    cartons: [cartonGroup(["E1"], [50, 40, 30], 6, [["threePack", 10]])]
  },
  overQuantity: {
    name: "More than the PO orders",
    receiver: "fba",
    note: "Four cartons of 120 bags is 480; the PO orders 400.",
    cartons: [cartonGroup(["A1", "A2", "A3", "A4"], [60, 40, 40], 15, [["natural", 120]])]
  },
  duplicates: {
    name: "Repeated carton and product",
    receiver: "fba",
    note: "Two rows both number their carton A1, so each shows both rows' issues, and B1 lists the Sage bag twice.",
    cartons: [
      cartonGroup(["A1"], [60, 40, 40], 12, [["natural", 40]]),
      cartonGroup(["A1"], [60, 40, 40], 12, [["natural", 40]]),
      cartonGroup(["B1"], [60, 40, 40], 12, [
        ["sage", 20],
        ["sage", 20]
      ])
    ]
  },
  mixedNetworks: {
    name: "FBA and AWD in one carton",
    receiver: "mixed",
    note: "The bags go to FBA and the tea towels to AWD, and B1 holds both.",
    cartons: [
      cartonGroup(["B1"], [60, 40, 40], 12.4, [
        ["sage", 40],
        ["stripe", 40]
      ])
    ]
  },
  warehouse: {
    name: "Buyer's warehouse",
    receiver: "warehouse",
    note: "The buyer's own warehouse takes any carton: these break every Amazon limit and pass.",
    cartons: [
      cartonGroup(["A1"], [120, 80, 80], 40, [
        ["natural", 300],
        ["sage", 40]
      ]),
      cartonGroup(["D1"], [50, 40, 30], 8, [["napkin", 60]])
    ]
  }
} satisfies Record<string, CartonDataSet>

// A pallet: its ID, size in cm, gross weight in kg, whether it stacks, and its cartons.
export function pallet(
  palletId: string,
  size: [number, number, number],
  weight: number,
  stackable: boolean,
  cartonIds: string[]
): PalletValue {
  return { palletId, length: size[0], width: size[1], height: size[2], weight, stackable, cartonIds }
}

// Twelve cartons of bags, A1–A12, for the pallets to hold.
export const palletCartonSet = [
  cartonGroup(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12"], [60, 40, 40], 12, [
    ["natural", 30]
  ])
]
const a = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `A${from + index}`)

// Pallets for cartons A1–A12, or the cartons it lists, for the receiver it names. `plenty` packs them against a PO with
// plenty of every product.
export type PalletDataSet = {
  name: string
  receiver: Receiver
  pallets: PalletValue[]
  note: string
  plenty?: boolean
  cartons?: CartonGroup[]
}

export const palletDataSets = {
  withinLimits: {
    name: "Within every limit",
    receiver: "fba",
    note: "A 48 × 40 in pallet, 127 cm tall and stackable, and one turned the other way round.",
    pallets: [
      pallet("1", [121.9, 101.6, 127], 300, true, a(1, 6)),
      pallet("2", [101.6, 121.9, 160], 320, false, a(7, 12))
    ]
  },
  footprint: {
    name: "Load over the edges",
    receiver: "fba",
    note: "Pallet 1 is 130 cm long and pallet 2 110 cm wide: both hang over a 48 × 40 in pallet.",
    pallets: [pallet("1", [130, 100, 120], 300, false, a(1, 6)), pallet("2", [120, 110, 120], 300, false, a(7, 12))]
  },
  height: {
    name: "Too tall",
    receiver: "fba",
    note: "Pallet 1 is 190 cm, over 72 in. Pallet 2 is 140 cm and stackable, over 50 in; pallet 3 is as tall but not stackable, which is fine.",
    pallets: [
      pallet("1", [120, 100, 190], 250, false, a(1, 4)),
      pallet("2", [120, 100, 140], 250, true, a(5, 8)),
      pallet("3", [120, 100, 140], 250, false, a(9, 12))
    ]
  },
  weight: {
    name: "Too heavy",
    receiver: "fba",
    note: "Pallet 1 weighs 700 kg, over 1,500 lb (680 kg). Pallet 2 weighs 680 kg exactly.",
    pallets: [pallet("1", [120, 100, 150], 700, false, a(1, 6)), pallet("2", [120, 100, 150], 680, false, a(7, 12))]
  },
  awd: {
    name: "AWD pallets",
    receiver: "awd_us",
    note: "AWD takes the same LTL and FTL pallet rules: pallet 1 is too tall and too heavy.",
    pallets: [pallet("1", [120, 100, 190], 700, false, a(1, 6)), pallet("2", [120, 100, 120], 300, true, a(7, 12))]
  },
  warehouse: {
    name: "Buyer's warehouse",
    receiver: "warehouse",
    note: "The buyer's own warehouse takes any pallet: this one breaks every Amazon limit and passes.",
    pallets: [pallet("1", [140, 120, 200], 900, true, a(1, 12))]
  },
  structure: {
    name: "Cartons and pallets that don't match",
    receiver: "fba",
    note: "Pallet 2 is listed twice, pallet 3 is empty, pallet 1 lists Z9, which isn't a carton, and A6 twice; A11 and A12 are on no pallet.",
    pallets: [
      pallet("1", [120, 100, 120], 300, false, [...a(1, 6), "Z9"]),
      pallet("2", [120, 100, 120], 300, false, a(6, 10)),
      pallet("2", [120, 100, 120], 50, false, []),
      pallet("3", [120, 100, 120], 25, false, [])
    ]
  },
  noPallets: {
    name: "Packed on pallets, but none",
    receiver: "fba",
    note: "The cartons ship on pallets, and there are none yet.",
    pallets: []
  }
} satisfies Record<string, PalletDataSet>

export const simulatorOrigin = northwindFactory
