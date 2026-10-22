import type { LogisticsRow } from "@/lib/logistics-list"

// Fictional rows from the approved Pen list frames awIJu and OzQcA, as the server would send them to a buyer.

const order: LogisticsRow = {
  id: "",
  href: "",
  reference: "",
  partner: "Lotus Manufacturing",
  forwarder: "Bayline Freight",
  destination: "Amazon FBA",
  status: "submitted",
  stage: "active",
  waiting: "supplier",
  source: "order",
  products: 3,
  shipped: 0,
  quantity: 420,
  total: "$2,958.00"
}

function purchaseOrder(number: number, overrides: Partial<LogisticsRow> = {}): LogisticsRow {
  return { ...order, id: `po-${number}`, href: `/orders/po-${number}`, reference: `PO-${number}`, ...overrides }
}

export const purchaseOrderListRows: LogisticsRow[] = [
  purchaseOrder(1047, {
    partner: "Cedar Works",
    forwarder: null,
    destination: "Oakland warehouse",
    status: "approval",
    waiting: "buyer",
    products: 2,
    quantity: 100,
    total: "$1,112.00"
  }),
  purchaseOrder(1046, {
    partner: "Cedar Works",
    forwarder: null,
    destination: "Reno 3PL",
    status: "draft",
    stage: "draft",
    waiting: "buyer",
    products: 2,
    quantity: 60,
    total: "$870.00"
  }),
  purchaseOrder(1045, { status: "waiting_labels", waiting: "buyer" }),
  purchaseOrder(1044, {
    partner: "Northwind Textiles",
    status: "changes_proposed",
    waiting: "buyer",
    products: 5,
    quantity: 900,
    total: "$6,100.00"
  }),
  ...Array.from({ length: 30 }, (_, i) =>
    purchaseOrder(1043 - i, {
      partner: i % 2 ? "Northwind Textiles" : "Lotus Manufacturing",
      status: i < 4 ? "shipped" : "closed",
      stage: i < 4 ? "active" : "closed",
      waiting: i < 4 ? "forwarder" : "done",
      shipped: 420
    })
  )
]

const shipment: LogisticsRow = {
  ...order,
  products: undefined,
  shipped: undefined,
  quantity: undefined,
  total: undefined,
  status: "packing",
  cartons: 9,
  ready: "2026-10-20"
}

function poShipment(number: number, part: number, overrides: Partial<LogisticsRow> = {}): LogisticsRow {
  return {
    ...shipment,
    id: `${number}-${part}`,
    href: `/shipments/${number}-${part}`,
    orderHref: `/orders/po-${number}`,
    reference: `PO-${number}`,
    number: part,
    ...overrides
  }
}

export const shipmentListRows: LogisticsRow[] = [
  poShipment(1045, 2),
  poShipment(1043, 1, {
    partner: "Northwind Textiles",
    destination: "Reno 3PL",
    ready: "2026-10-09",
    status: "ready",
    waiting: "supplier"
  }),
  poShipment(1044, 1, {
    detail: "Rejected by Amazon",
    partner: "Northwind Textiles",
    cartons: 8,
    ready: "2026-10-06",
    status: "needs_attention",
    waiting: "buyer"
  }),
  poShipment(1039, 2, {
    detail: "FBA18K3LQ7",
    partner: "Northwind Textiles",
    forwarder: null,
    cartons: 6,
    ready: "2026-10-04",
    status: "waiting_labels",
    waiting: "buyer"
  }),
  poShipment(1045, 1, { cartons: 12, ready: "2026-10-02", status: "approval", waiting: "buyer" }),
  poShipment(1042, 1, {
    detail: "FBA17XK2QM",
    cartons: 12,
    ready: "2026-09-22",
    status: "shipped",
    waiting: "forwarder"
  }),
  poShipment(1042, 2, {
    detail: "CS-1007",
    cartons: 10,
    ready: "2026-09-26",
    status: "forwarded",
    waiting: "amazon"
  }),
  {
    ...shipment,
    id: "FBA17V2P1R",
    href: "https://sellercentral.amazon.com/fba/inbound-shipment/summary/FBA17V2P1R",
    external: true,
    reference: "FBA17V2P1R",
    detail: "Created in Seller Central",
    partner: null,
    forwarder: null,
    destination: "Amazon FBA",
    status: "IN_TRANSIT",
    waiting: "amazon",
    source: "amazon",
    cartons: undefined,
    ready: null
  },
  poShipment(1040, 2, {
    detail: "MATS-2291",
    partner: "Northwind Textiles",
    destination: "Oakland warehouse",
    cartons: 6,
    ready: "2026-09-12",
    status: "forwarded",
    waiting: "carrier"
  }),
  poShipment(1036, 1, {
    detail: "FBA17R5N2K",
    cartons: 14,
    ready: "2026-09-02",
    status: "received",
    stage: "closed",
    waiting: "done"
  }),
  ...Array.from({ length: 24 }, (_, i) =>
    poShipment(1035 - i, 1, {
      detail: `FBA-SAMPLE-${i + 1}`,
      ready: "2026-09-01",
      status: i < 3 ? "shipped" : "received",
      stage: i < 3 ? "active" : "closed",
      waiting: i < 3 ? "forwarder" : "done"
    })
  )
]
