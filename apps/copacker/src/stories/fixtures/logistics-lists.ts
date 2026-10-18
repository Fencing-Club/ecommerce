import type { StatusTone } from "@/components/common"

export type LogisticsRow = {
  id: string
  reference: string
  detail: string
  supplier: string
  origin: string
  destination: string
  status: string
  tone: StatusTone
  view: string
  needsYou?: boolean
  cartons: number
  ready: string
  waiting: "Supplier" | "Forwarder" | "You" | "Amazon" | "Done"
  source: "Purchase order" | "Amazon"
  products: number
  shipped: number
  quantity: number
  total: number
}

const base: LogisticsRow = {
  id: "",
  reference: "",
  detail: "",
  supplier: "Lotus Manufacturing",
  origin: "Bayline Freight",
  destination: "Amazon ONT8",
  status: "Packing",
  tone: "info",
  view: "Packing",
  cartons: 9,
  ready: "2026-10-20",
  waiting: "Supplier",
  source: "Purchase order",
  products: 3,
  shipped: 0,
  quantity: 420,
  total: 295800
}

// Fictional review data from the approved Pen frames awIJu and OzQcA.
export const purchaseOrderListRows: LogisticsRow[] = [
  {
    ...base,
    id: "1045",
    reference: "PO-1045",
    status: "Approve invoice",
    tone: "warning",
    view: "With supplier",
    needsYou: true
  },
  {
    ...base,
    id: "1044",
    reference: "PO-1044",
    supplier: "Northwind Textiles",
    status: "Changes proposed",
    tone: "warning",
    view: "With supplier",
    needsYou: true,
    products: 5,
    quantity: 900,
    total: 610000
  },
  {
    ...base,
    id: "1047",
    reference: "PO-1047",
    supplier: "Cedar Works",
    origin: "Direct",
    destination: "Oakland warehouse",
    status: "Declined",
    tone: "warning",
    view: "With supplier",
    needsYou: true,
    products: 2,
    quantity: 100,
    total: 111200
  },
  {
    ...base,
    id: "1046",
    reference: "PO-1046",
    supplier: "Cedar Works",
    origin: "Direct",
    destination: "Reno 3PL",
    status: "Draft",
    tone: "neutral",
    view: "Drafts",
    needsYou: true,
    products: 2,
    quantity: 60,
    total: 87000
  },
  ...Array.from(
    { length: 49 },
    (_, i): LogisticsRow => ({
      ...base,
      id: `po-${i}`,
      reference: `PO-${1043 - i}`,
      supplier: i % 2 ? "Northwind Textiles" : "Lotus Manufacturing",
      view: i < 2 ? "With supplier" : laterOrderView(i),
      status: i < 2 ? "Accepted" : laterOrderView(i),
      tone: i < 4 ? "info" : "neutral",
      shipped: i < 2 ? 0 : 420
    })
  )
]

export const shipmentListRows: LogisticsRow[] = [
  { ...base, id: "1045-2", reference: "PO-1045, shipment 2", destination: "Amazon FBA ONT8" },
  {
    ...base,
    id: "1043-1",
    reference: "PO-1043, shipment 1",
    detail: "To a 3PL",
    supplier: "Northwind Textiles",
    destination: "Reno 3PL",
    ready: "2026-10-09",
    status: "Ready for pickup",
    view: "Ready for pickup",
    tone: "success",
    waiting: "Forwarder"
  },
  {
    ...base,
    id: "1044-1",
    reference: "PO-1044, shipment 1",
    detail: "Rejected by Amazon",
    supplier: "Northwind Textiles",
    destination: "Amazon LGB8",
    cartons: 8,
    ready: "2026-10-06",
    status: "Needs attention",
    tone: "destructive",
    needsYou: true,
    waiting: "You"
  },
  {
    ...base,
    id: "1039-2",
    reference: "PO-1039, shipment 2",
    detail: "FBA18K3LQ7",
    supplier: "Northwind Textiles",
    origin: "Direct",
    destination: "Amazon LGB8",
    cartons: 6,
    ready: "2026-10-04",
    status: "Needs shipping labels",
    tone: "warning",
    needsYou: true,
    waiting: "You"
  },
  {
    ...base,
    id: "1045-1",
    reference: "PO-1045, shipment 1",
    detail: "Amazon shipment on approval",
    cartons: 12,
    ready: "2026-10-02",
    status: "Approval needed",
    tone: "warning",
    needsYou: true,
    waiting: "You"
  },
  {
    ...base,
    id: "1042-1",
    reference: "PO-1042, shipment 1",
    detail: "FBA17XK2QM",
    cartons: 12,
    ready: "2026-09-22",
    status: "In transit",
    view: "In transit",
    waiting: "Forwarder"
  },
  {
    ...base,
    id: "1042-2",
    reference: "PO-1042, shipment 2",
    detail: "In CS-1007",
    cartons: 10,
    ready: "2026-09-26",
    status: "At the forwarder",
    view: "In transit",
    waiting: "Forwarder"
  },
  {
    ...base,
    id: "FBA17V2P1R",
    reference: "FBA17V2P1R",
    detail: "Created in Seller Central",
    supplier: "Your Amazon account",
    origin: "Oakland",
    destination: "Amazon SMF3",
    cartons: 4,
    ready: "2026-09-18",
    status: "In transit",
    view: "In transit",
    waiting: "Amazon",
    source: "Amazon"
  },
  {
    ...base,
    id: "1040-1",
    reference: "PO-1040, shipment 1",
    detail: "FBA17W8M4D",
    supplier: "Northwind Textiles",
    destination: "Amazon LGB8",
    cartons: 10,
    ready: "2026-09-15",
    status: "Receiving",
    view: "Receiving",
    waiting: "Amazon"
  },
  {
    ...base,
    id: "1040-2",
    reference: "PO-1040, shipment 2",
    detail: "Matson MATS-2291",
    supplier: "Northwind Textiles",
    destination: "Oakland warehouse",
    cartons: 6,
    ready: "2026-09-12",
    status: "Receiving",
    view: "Receiving",
    waiting: "You"
  },
  {
    ...base,
    id: "1036-1",
    reference: "PO-1036, shipment 1",
    detail: "FBA17R5N2K",
    cartons: 14,
    ready: "2026-09-02",
    status: "Received",
    view: "Received",
    tone: "neutral",
    waiting: "Done"
  },
  ...Array.from(
    { length: 45 },
    (_, i): LogisticsRow => ({
      ...base,
      id: `shipment-${i}`,
      reference: `PO-${1035 - i}, shipment 1`,
      detail: `FBA-SAMPLE-${i + 1}`,
      ready: "2026-09-01",
      view: i === 0 ? "Ready for pickup" : laterShipmentView(i),
      status: i === 0 ? "Ready for pickup" : laterShipmentView(i),
      tone: i === 0 ? "success" : laterShipmentTone(i),
      waiting: i < 3 ? "Forwarder" : "Done",
      needsYou: i === 0
    })
  )
]

function laterOrderView(index: number) {
  return index < 4 ? "In transit" : "Closed"
}
function laterShipmentView(index: number) {
  return index < 3 ? "In transit" : "Received"
}
function laterShipmentTone(index: number) {
  return index < 3 ? "info" : "neutral"
}
