import { expect, screen, waitFor, within } from "storybook/test"
import type { AglBooking, AglShipment, AglTemplateIssue } from "@/components/booking/agl-booking"
import type { FbaBooking, FbaPlacement } from "@/components/booking/fba-booking"

// The Amazon booking dialogs' data, as the designs in copacker.pen show them (06.17 and 06.18): the second shipment of
// purchase order 36, 100 chest protectors in 5 cartons, from Zhangjiagang.

// The booking dialog once it shows, after checking it's the one height every step keeps: 30rem, or the window's height
// when that's shorter.
export async function bookingDialog(name: string) {
  const dialog = await screen.findByRole("dialog", { name })
  await waitFor(() => expect(dialog).toBeVisible())
  await expect(dialog.offsetHeight).toBe(Math.min(480, window.innerHeight - 32))
  return within(dialog)
}

const sellerCentralUrl = "https://sellercentral.amazon.com/fba/sendtoamazon"

export const chestProtectors: AglShipment = {
  id: "FBA18Z4K2QRL",
  name: "PO36 / Chest protectors",
  cartons: 5,
  units: 100,
  match: "matches"
}

// The buyer's other shipments in Amazon, newest first.
export const otherShipments: AglShipment[] = [
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

export const templateIssues: AglTemplateIssue[] = [
  { kind: "mixedGroups", carton: 3, groups: ["Men / XS", "Men / S"] },
  { kind: "noWeight", carton: 5 },
  { kind: "unitsDiffer", product: "Chest protector / Women / M", expected: 13, packed: 15 }
]

export const filledTemplate = {
  status: "filled",
  file: { name: "PO36-Shipment-2-box-content.xlsx", href: "/api/shipments/ship_2/agl/box-content" }
} satisfies AglBooking["template"]

export const aglBooking: AglBooking = {
  kind: "cartons",
  file: { name: "PO36-Shipment-2-inventory.xlsx", href: "/api/shipments/ship_2/agl/inventory" },
  cartons: 5,
  units: 100,
  sellerCentralUrl,
  missingSkus: [],
  template: { status: "empty" },
  shipments: [chestProtectors, ...otherShipments],
  linked: null
}

export const linkedBooking: AglBooking = {
  ...aglBooking,
  template: filledTemplate,
  linked: {
    shipment: chestProtectors,
    labels: { status: "ready", href: "/api/shipments/ship_2/labels", count: 5 },
    customsUrl: "https://sellercentral.amazon.com/fba/inbound-shipment/summary/FBA18Z4K2QRL/customs"
  }
}

const hagerstown: FbaPlacement = {
  id: "hgr6",
  warehouses: [{ code: "HGR6", place: "Hagerstown, MD" }],
  placementFee: 40.2,
  quotes: [
    {
      id: "amass-standard",
      carrier: "Amass",
      name: "Amass standard truck",
      service: "Standard truck",
      mode: "Ocean LCL",
      shipping: 103.92
    },
    {
      id: "niuku-standard",
      carrier: "Niuku",
      name: "Niuku standard truck",
      service: "Standard truck",
      mode: "Ocean LCL",
      shipping: 118.17
    },
    {
      id: "catch-standard",
      carrier: "CATCH",
      name: "CATCH standard truck",
      service: "Standard truck",
      mode: "Ocean LCL",
      shipping: 124.71
    },
    {
      id: "catch-fast",
      carrier: "CATCH",
      name: "CATCH fast truck",
      service: "Fast truck",
      mode: "Ocean LCL",
      shipping: 156.82
    }
  ]
}

export const placements: FbaPlacement[] = [
  hagerstown,
  {
    id: "poc1",
    warehouses: [{ code: "POC1", place: "Fontana, CA" }],
    placementFee: 77.2,
    quotes: [
      {
        id: "amass-standard-poc1",
        carrier: "Amass",
        name: "Amass standard truck",
        service: "Standard truck",
        mode: "Ocean LCL",
        shipping: 78.71
      }
    ]
  },
  {
    id: "bna6",
    warehouses: [{ code: "BNA6", place: "Clarksville, TN" }],
    placementFee: 58.7,
    quotes: [
      {
        id: "niuku-standard-bna6",
        carrier: "Niuku",
        name: "Niuku standard truck",
        service: "Standard truck",
        mode: "Ocean LCL",
        shipping: 108.86
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
        shipping: 184.78
      }
    ]
  }
]

export const fbaBooking: FbaBooking = {
  shipment: "Shipment 2",
  currency: "USD",
  pickup: { place: "Zhangjiagang, China", ready: new Date("2026-10-21T12:00:00Z") },
  // Oct 21, 10:31 PM in Los Angeles, where the stories' clocks are.
  options: { status: "ready", placements, heldUntil: new Date("2026-10-22T05:31:00Z"), expired: false },
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

export const bookedFba: FbaBooking = {
  ...fbaBooking,
  booked: {
    place: "Hagerstown, MD",
    service: "Amass standard truck",
    total: 144.12,
    amazonLabels: { status: "ready", href: "/api/shipments/ship_2/labels", count: 5 },
    carrierLabels: { carrier: "Amass", labels: { status: "ready", href: "/api/shipments/ship_2/carrier-labels" } }
  }
}
