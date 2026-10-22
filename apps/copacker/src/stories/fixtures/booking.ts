import type { AglBooking, AglShipment, AglTemplateIssue } from "@/components/booking/agl-booking"
import type { FbaBooking, FbaPlacement } from "@/components/booking/fba-booking"

// The Amazon booking dialogs' data, as copacker.pen draws it in 10 / Amazon booking (10.02 FBA, 10.03 AGL): the second
// shipment of purchase order 36, 100 chest protectors in 5 cartons, from Zhangjiagang. Every state the designs draw is
// one booking here, so a state's story is that booking and the step it opens on.

// The shipment as Amazon lists it once it's booked, matching the packing.
export const chestProtectors: AglShipment = {
  id: "FBA18Z4K2QRL",
  name: "PO36 / Chest protectors",
  cartons: 5,
  units: 100,
  match: "matches"
}

// The buyer's other shipments in Amazon, newest first.
const otherShipments: AglShipment[] = [
  { id: "FBA18X0P7MNT", name: "October replenishment", shipments: 2, cartons: 12, units: 240 },
  { id: "FBA18W2H6PQC", name: "Knee pads restock", cartons: 8, units: 160 },
  { id: "FBA18V9J1RTD", name: "PO33 / Elbow sleeves", cartons: 6, units: 72 },
  { id: "FBA18T4C8LNB", name: "PO32 / Wrist wraps", cartons: 4, units: 48 }
]

// The shipment as booked with other counts than the packing's.
export const differingShipment: AglShipment = {
  ...chestProtectors,
  units: 96,
  match: "differs",
  differences: [
    { product: "Chest protector / Men / XS", amazon: 6, packing: 10 },
    { product: "Chest protector / Men / S", amazon: 22, packing: 20 },
    { product: "Chest protector / Women / M", amazon: 13, packing: 15 }
  ]
}

const mixedGroups: AglTemplateIssue = { kind: "mixedGroups", carton: 3, groups: ["Men / XS", "Men / S"] }

// What the template check found: a carton holding two packing groups, a carton without its weight, and a product
// packed in another count than Amazon expects.
export const templateIssues: AglTemplateIssue[] = [
  mixedGroups,
  { kind: "noWeight", carton: 5 },
  { kind: "unitsDiffer", product: "Chest protector / Women / M", expected: 13, packed: 15 }
]

// The carton problem as the AGL start step words it, for the stories of the pieces that show a problem.
export const cartonIssue = {
  title: "Carton 3 mixes two packing groups",
  description: "Men / XS and Men / S need separate cartons",
  action: "Edit carton 3"
}

const aglStart: AglBooking = {
  kind: "cartons",
  file: { name: "PO36-Shipment-2-inventory.xlsx", href: "/api/shipments/ship_2/agl/inventory" },
  cartons: 5,
  units: 100,
  sellerCentralUrl: "https://sellercentral.amazon.com/fba/sendtoamazon",
  missingSkus: [],
  template: { status: "empty" },
  shipments: [chestProtectors, ...otherShipments],
  linked: null
}

const templateFilled: AglBooking = {
  ...aglStart,
  template: {
    status: "filled",
    file: { name: "PO36-Shipment-2-box-content.xlsx", href: "/api/shipments/ship_2/agl/box-content" }
  }
}

const linked = {
  shipment: chestProtectors,
  labels: { status: "ready", href: "/api/shipments/ship_2/labels", count: 5 },
  customsUrl: "https://sellercentral.amazon.com/fba/inbound-shipment/summary/FBA18Z4K2QRL/customs"
} satisfies AglBooking["linked"]

// 10.03, booking Amazon Global Logistics.
export const agl = {
  // The three steps, then the linked shipment.
  start: aglStart,
  templateFilled,
  linked: { ...templateFilled, linked },
  // Products without an Amazon SKU stop the inventory file.
  missingSkus: {
    ...aglStart,
    missingSkus: [
      { product: "Chest protector / Men / XS", supplierSku: "CP-M-XS" },
      { product: "Chest protector / Men / S", supplierSku: "CP-M-S" }
    ]
  },
  filling: { ...aglStart, template: { status: "filling", progress: 66 } },
  // Case packs of one SKU carry their own carton details; AWD books by case pack from the packing list.
  casePacks: {
    ...aglStart,
    kind: "casePacks",
    file: { name: "PO36-Shipment-3-inventory.xlsx", href: "/api/shipments/ship_3/agl/inventory" },
    cartons: 6,
    units: 120
  },
  awd: {
    ...aglStart,
    kind: "awd",
    file: { name: "PO36-Shipment-4-packing-list.pdf", href: "/api/shipments/ship_4/packing-list" },
    cartons: 6,
    units: 144
  },
  // Problems with the template: one, or all three.
  cartonNeedsRepacking: { ...aglStart, template: { status: "issues", issues: [mixedGroups] } },
  severalIssues: { ...aglStart, template: { status: "issues", issues: templateIssues } },
  // Linking: the new shipment not listed yet, or booked with other counts.
  notListedYet: { ...templateFilled, shipments: otherShipments },
  differs: { ...templateFilled, shipments: [differingShipment, ...otherShipments] },
  // The labels, still coming or not sent.
  gettingLabels: { ...templateFilled, linked: { ...linked, labels: { status: "pending" } } },
  labelsFailed: { ...templateFilled, linked: { ...linked, labels: { status: "failed" } } }
} satisfies Record<string, AglBooking>

const hagerstown: FbaPlacement = {
  id: "hgr6",
  warehouses: [{ code: "HGR6", place: "Hagerstown, MD" }],
  placementFee: 4020,
  quotes: [
    {
      id: "amass-standard",
      carrier: "Amass",
      name: "Amass standard truck",
      service: "Standard truck",
      mode: "Ocean LCL",
      shipping: 10392
    },
    {
      id: "niuku-standard",
      carrier: "Niuku",
      name: "Niuku standard truck",
      service: "Standard truck",
      mode: "Ocean LCL",
      shipping: 11817
    },
    {
      id: "catch-standard",
      carrier: "CATCH",
      name: "CATCH standard truck",
      service: "Standard truck",
      mode: "Ocean LCL",
      shipping: 12471
    },
    {
      id: "catch-fast",
      carrier: "CATCH",
      name: "CATCH fast truck",
      service: "Fast truck",
      mode: "Ocean LCL",
      shipping: 15682
    }
  ]
}

// Where Amazon can place the shipment: three warehouses, or a split across five with no placement fee.
const placements: FbaPlacement[] = [
  hagerstown,
  {
    id: "poc1",
    warehouses: [{ code: "POC1", place: "Fontana, CA" }],
    placementFee: 7720,
    quotes: [
      {
        id: "amass-standard-poc1",
        carrier: "Amass",
        name: "Amass standard truck",
        service: "Standard truck",
        mode: "Ocean LCL",
        shipping: 7871
      }
    ]
  },
  {
    id: "bna6",
    warehouses: [{ code: "BNA6", place: "Clarksville, TN" }],
    placementFee: 5870,
    quotes: [
      {
        id: "niuku-standard-bna6",
        carrier: "Niuku",
        name: "Niuku standard truck",
        service: "Standard truck",
        mode: "Ocean LCL",
        shipping: 10886
      }
    ]
  },
  {
    id: "split",
    warehouses: [
      { code: "BJC1", place: "Aurora, CO" },
      { code: "IAH3", place: "Houston, TX" },
      { code: "RDU2", place: "Garner, NC" },
      { code: "SWF2", place: "Newburgh, NY" },
      { code: "MCC1", place: "Sacramento, CA" }
    ],
    placementFee: 0,
    quotes: [
      {
        id: "amass-courier",
        carrier: "Amass",
        name: "Amass standard courier",
        service: "Standard courier",
        mode: "Ocean LCL",
        shipping: 18478
      }
    ]
  }
]

// Oct 21, 10:31 PM in Los Angeles, where the stories' clocks are.
const heldUntil = new Date("2026-10-22T05:31:00Z")

const fbaChoose: FbaBooking = {
  shipment: "Shipment 2",
  currency: "USD",
  pickup: { place: "Zhangjiagang, China", ready: new Date("2026-10-21T12:00:00Z") },
  options: { status: "ready", placements, heldUntil, expired: false },
  ownCarrier: {
    carriers: ["DHL Express", "FedEx", "UPS"],
    windows: [
      { id: "window-1", start: new Date("2026-10-28T12:00:00Z"), end: new Date("2026-11-03T12:00:00Z") },
      { id: "window-2", start: new Date("2026-11-04T12:00:00Z"), end: new Date("2026-11-10T12:00:00Z") }
    ]
  },
  termsUrl: "https://sellercentral.amazon.com/help/hub/reference/external/carrier-terms",
  booked: null
}

const booked = {
  place: "Hagerstown, MD",
  service: "Amass standard truck",
  total: 14412,
  amazonLabels: { status: "ready", href: "/api/shipments/ship_2/labels", count: 5 },
  carrierLabels: { carrier: "Amass", labels: { status: "ready", href: "/api/shipments/ship_2/carrier-labels" } }
} satisfies FbaBooking["booked"]

// 10.02, booking FBA transport through Amazon.
export const fba = {
  // Choosing, reviewing and booking start from the same options.
  choose: fbaChoose,
  booked: { ...fbaChoose, booked },
  // Why there are no options to choose from.
  reconnect: { ...fbaChoose, options: { status: "reconnect" } },
  failed: { ...fbaChoose, options: { status: "failed" } },
  packingIssues: {
    ...fbaChoose,
    options: {
      status: "issues",
      issues: [
        { kind: "cartonVolume", first: 1, last: 5 },
        { kind: "notEligible", product: "Chest protector / Women / XL" }
      ]
    }
  },
  expired: { ...fbaChoose, options: { status: "ready", placements, heldUntil, expired: true } },
  // The labels, still coming from Amazon and the carrier.
  gettingLabels: {
    ...fbaChoose,
    booked: {
      ...booked,
      amazonLabels: { status: "pending" },
      carrierLabels: { carrier: "Amass", labels: { status: "pending" } }
    }
  }
} satisfies Record<string, FbaBooking>
