import type { ComponentProps } from "react"
import type { OrderReviser, ReviserProduct } from "@/components/supplier/order-reviser"
import type { EditorProduct, EditorVariant } from "@/components/supplier/product-editor"
import type { ProductRow } from "@/components/supplier/product-index"
import type { Permissions } from "@/lib/access"
import { defaultQuantityRules } from "@/lib/catalog-pricing"
import { readPeriod } from "@/lib/date-range"
import type { ProductImage } from "@/lib/supplier-product"
import { addDays } from "@/lib/time-zone"
import type { catalogList, CatalogEditorData } from "@/server/catalogs"
import type { proposalChanges } from "@/server/order-proposals"
import type { SupplierOverviewData } from "@/server/supplier-overview"
import type {
  customerDetail,
  customerList,
  InventoryRow,
  ListedOrder,
  OrderStage,
  SupplierOrder
} from "@/server/supplier-workspace"
import { workspaces } from "@/stories/workspace"
import { daysAgo } from "./orders"

// A supplier workspace's catalogs, customers, products, stock and orders, for stories. The supplier is Lotus
// Manufacturing; its customers are buyers that added it as their supplier.

const id = (group: string, n: number) => `${group}-4b3e-4f5a-8c6d-${String(n).padStart(12, "0")}`

// A photo in document storage. The server's types give every product a main photo (`images[0] ?? null` reads as the
// photo's type), so each fixture has one.
function image(name: string): ProductImage {
  return { key: `supplier-images/org_supplier/${name}`, name, contentType: "image/png" }
}

export const photo = image("tote.png")

// Customers: buyers that work with the supplier, by their own names.
export const customerIds = {
  harbor: id("3c7a9e10", 1),
  pine: id("3c7a9e10", 2),
  summit: id("3c7a9e10", 3),
  bluebird: id("3c7a9e10", 4)
}

export const catalogIds = {
  wholesale: id("6a2d4f80", 1),
  retail: id("6a2d4f80", 2),
  legacy: id("6a2d4f80", 3)
}

type CatalogRow = Awaited<ReturnType<typeof catalogList>>[number]

function catalogRow(overrides: Partial<CatalogRow> & Pick<CatalogRow, "id" | "title">): CatalogRow {
  return {
    supplierOrgId: workspaces.supplier.id,
    status: "active",
    adjustmentBasisPoints: 0,
    includeNewProducts: true,
    revision: 3,
    createdAt: daysAgo(120),
    updatedAt: daysAgo(4),
    products: 3,
    overrides: 0,
    customers: [],
    ...overrides
  }
}

// The Catalogs list: an active catalog with two customers, a draft for one, and an archived one for nobody.
export const catalogRows: CatalogRow[] = [
  catalogRow({
    id: catalogIds.wholesale,
    title: "Wholesale 2026",
    adjustmentBasisPoints: -1000,
    overrides: 2,
    customers: ["Harbor Goods", "Summit Outfitters"]
  }),
  catalogRow({
    id: catalogIds.retail,
    title: "Retail partners",
    status: "draft",
    adjustmentBasisPoints: 500,
    products: 2,
    customers: ["Pine & Paper Co."]
  }),
  catalogRow({ id: catalogIds.legacy, title: "Legacy pricing", status: "archived", products: 1 })
]

// Catalogs as a customer's picker lists them.
export const catalogOptions = catalogRows.map(({ id: catalogId, title, status }) => ({ id: catalogId, title, status }))

type CatalogProduct = CatalogEditorData["products"][number]
type CatalogVariant = CatalogProduct["variants"][number]

function catalogVariant(n: number, overrides: Partial<CatalogVariant>): CatalogVariant {
  return {
    id: id("9d51b7c2", n),
    supplierSku: `LM-${n}`,
    currency: "USD",
    priceMinor: 1000,
    priceBasis: "piece",
    priceBreaks: [],
    quantityRules: defaultQuantityRules,
    label: null,
    ...overrides
  }
}

// Every active product, as the catalog form lists them: a tote in two colors, an apron with volume pricing, and a
// basket without a price.
export const catalogProducts: CatalogProduct[] = [
  {
    id: id("2f8c6b14", 1),
    title: "Canvas tote bag",
    image: photo,
    variants: [
      catalogVariant(1, { supplierSku: "LM-TOTE-NAT", priceMinor: 425, label: "Natural" }),
      catalogVariant(2, { supplierSku: "LM-TOTE-BLK", priceMinor: 450, label: "Black" })
    ]
  },
  {
    id: id("2f8c6b14", 2),
    title: "Linen apron",
    image: image("apron.png"),
    variants: [
      catalogVariant(3, {
        supplierSku: "LM-APRON",
        priceMinor: 890,
        priceBreaks: [{ minimum: 100, priceMinor: 850 }],
        quantityRules: { increment: 1, minimum: 12, maximum: null }
      })
    ]
  },
  {
    id: id("2f8c6b14", 3),
    title: "Market basket",
    image: image("basket.png"),
    variants: [catalogVariant(4, { supplierSku: "LM-BASKET", priceMinor: null })]
  }
]

// More products than one page of the catalog form holds.
export function manyCatalogProducts(count: number): CatalogProduct[] {
  return Array.from({ length: count }, (_, index) => ({
    id: id("2f8c6b15", index + 1),
    title: `Stoneware mug ${String(index + 1).padStart(2, "0")}`,
    image: image("mug.png"),
    variants: [catalogVariant(100 + index, { supplierSku: `LM-MUG-${index + 1}`, priceMinor: 600 + index * 10 })]
  }))
}

const catalogCustomers: CatalogEditorData["customers"] = [
  { id: customerIds.harbor, name: "Harbor Goods", assigned: true, otherCatalog: null },
  { id: customerIds.pine, name: "Pine & Paper Co.", assigned: false, otherCatalog: "Retail partners" },
  { id: customerIds.summit, name: "Summit Outfitters", assigned: true, otherCatalog: null },
  { id: customerIds.bluebird, name: "Bluebird Home", assigned: false, otherCatalog: null }
]

// The Wholesale catalog's form: 10% off, with the tote's natural color at a fixed price and the apron's own rules. The
// basket is left out.
export const wholesaleCatalog: CatalogEditorData = {
  catalog: {
    id: catalogIds.wholesale,
    supplierOrgId: workspaces.supplier.id,
    title: "Wholesale 2026",
    status: "active",
    adjustmentBasisPoints: -1000,
    includeNewProducts: true,
    revision: 3,
    createdAt: daysAgo(120),
    updatedAt: daysAgo(4)
  },
  products: catalogProducts,
  entries: [
    { productId: id("9d51b7c2", 1), priceMinor: 400, priceBreaks: null, quantityRules: null },
    { productId: id("9d51b7c2", 2), priceMinor: null, priceBreaks: null, quantityRules: null },
    {
      productId: id("9d51b7c2", 3),
      priceMinor: null,
      priceBreaks: [{ minimum: 50, priceMinor: 780 }],
      quantityRules: { increment: 6, minimum: 12, maximum: null }
    }
  ],
  customers: catalogCustomers
}

// A catalog that isn't saved yet. The server's type calls it a row (its `rows[0] ?? null` reads as the row's type), so
// the missing one is typed as a row.
function unsaved(): CatalogEditorData["catalog"] {
  return null!
}

// A new catalog's form: every product, and customers to assign.
export const newCatalog: CatalogEditorData = {
  catalog: unsaved(),
  products: catalogProducts,
  entries: [],
  customers: catalogCustomers.map((customer) => ({ ...customer, assigned: false }))
}

// A customer as the Customers list has it. One that hasn't ordered has no last order, which the server's type leaves
// out (`own[0]?.sentAt ?? null` reads as a date).
type CustomerRow = Omit<Awaited<ReturnType<typeof customerList>>["customers"][number], "lastOrderAt"> & {
  lastOrderAt: Date | null
}

function customerRow(
  customerId: string,
  name: string,
  catalogId: string | null,
  overrides: Partial<CustomerRow> = {}
): CustomerRow {
  const catalog = catalogOptions.find((option) => option.id === catalogId) ?? null
  return {
    id: customerId,
    name,
    buyerOrgId: `buyer-${customerId}`,
    catalogId,
    createdAt: daysAgo(300),
    catalog,
    orders: 0,
    open: 0,
    spent: [],
    lastOrderAt: null,
    ...overrides
  }
}

// The Customers list: two on the Wholesale catalog, one on the draft Retail one, and one without a catalog.
export const customerRows: CustomerRow[] = [
  customerRow(customerIds.bluebird, "Bluebird Home", null, { createdAt: daysAgo(20) }),
  customerRow(customerIds.harbor, "Harbor Goods", catalogIds.wholesale, {
    orders: 6,
    open: 2,
    spent: [
      { currency: "USD", amount: 1_284_000 },
      { currency: "EUR", amount: 96_000 }
    ],
    lastOrderAt: daysAgo(3)
  }),
  customerRow(customerIds.pine, "Pine & Paper Co.", catalogIds.retail, {
    orders: 2,
    spent: [{ currency: "USD", amount: 212_500 }],
    lastOrderAt: daysAgo(45)
  }),
  customerRow(customerIds.summit, "Summit Outfitters", catalogIds.wholesale, {
    orders: 1,
    open: 1,
    spent: [{ currency: "USD", amount: 54_000 }],
    lastOrderAt: daysAgo(9)
  })
]

export const customerListData = { catalogs: catalogOptions, customers: customerRows }

let orderCount = 0

// An order a customer sent, as the supplier's lists show it.
function supplierOrder(reference: string, stage: OrderStage, overrides: Partial<SupplierOrder> = {}): SupplierOrder {
  orderCount += 1
  const statuses = { pack: "packing", waiting: "waiting_labels", ship: "ready", shipped: "shipped", closed: "closed" }
  return {
    id: id("5e9b2d71", orderCount),
    reference,
    customerId: customerIds.harbor,
    customer: "Harbor Goods",
    sentAt: daysAgo(orderCount),
    orderStatus: stage === "closed" ? "closed" : "submitted",
    status: statuses[stage],
    stage,
    shipmentId: id("7a4c1e93", orderCount),
    currency: "USD",
    total: 102_000 + orderCount * 1000,
    pieces: 240 + orderCount * 12,
    lines: 3,
    firstItem: "Canvas tote bag",
    ...overrides
  }
}

// One order at each stage, from two customers.
export const supplierOrders: SupplierOrder[] = [
  supplierOrder("PO-2051", "pack"),
  supplierOrder("PO-2050", "pack", { customerId: customerIds.summit, customer: "Summit Outfitters", lines: 1 }),
  supplierOrder("PO-2049", "waiting", { firstItem: "Linen apron" }),
  supplierOrder("PO-2048", "ship", { currency: "EUR", total: 96_000 }),
  supplierOrder("PO-2047", "shipped", { customerId: customerIds.summit, customer: "Summit Outfitters" }),
  supplierOrder("PO-2046", "closed", { firstItem: "Market basket", lines: 2 })
]

// Orders as someone who doesn't see prices gets them.
export const unpricedOrders: ListedOrder[] = supplierOrders.map((order) => ({ ...order, total: null }))

// More orders than one page of the list holds.
export function manySupplierOrders(count: number): SupplierOrder[] {
  return Array.from({ length: count }, (_, index) =>
    supplierOrder(`PO-${3000 + index}`, index % 2 ? "shipped" : "pack")
  )
}

type CustomerDetail = Omit<NonNullable<Awaited<ReturnType<typeof customerDetail>>>, "customer"> & {
  customer: CustomerRow
}

// Harbor Goods' page: its contact details, catalog and orders.
export const harborDetail: CustomerDetail = {
  customer: customerRows[1]!,
  contact: {
    name: "Jordan Lee",
    email: "jordan@example.com",
    phone: "+14252602501",
    website: "https://harbor.example.com"
  },
  catalogs: catalogOptions,
  orders: supplierOrders.filter((order) => order.customerId === customerIds.harbor)
}

function inventoryRow(n: number, overrides: Partial<InventoryRow>): InventoryRow {
  const row = {
    id: id("1b6e8f42", n),
    groupId: id("2f8c6b14", n),
    supplierSku: `LM-${n}`,
    trackInventory: true,
    onHand: 100,
    continueSelling: false,
    revision: 1,
    title: "Canvas tote bag",
    variant: null,
    image: photo,
    committed: 0,
    ...overrides
  }
  return { ...row, available: row.onHand - row.committed }
}

// Stock: a tote in two colors (one short of what's ordered), an apron that keeps selling, and an untracked basket.
export const inventoryRows: InventoryRow[] = [
  inventoryRow(1, { supplierSku: "LM-TOTE-NAT", variant: "Natural", image: photo, onHand: 120, committed: 80 }),
  inventoryRow(2, { supplierSku: "LM-TOTE-BLK", variant: "Black", image: photo, onHand: 40, committed: 64 }),
  inventoryRow(3, {
    title: "Linen apron",
    supplierSku: "LM-APRON",
    image: image("apron.png"),
    onHand: 0,
    continueSelling: true
  }),
  inventoryRow(4, {
    title: "Market basket",
    supplierSku: "LM-BASKET",
    image: image("basket.png"),
    trackInventory: false,
    onHand: 0
  })
]

type RowVariant = ProductRow["variants"][number]

function rowVariant(supplierSku: string, overrides: Partial<RowVariant> = {}): RowVariant {
  return {
    supplierSku,
    currency: "USD",
    priceMinor: 425,
    priceBasis: "piece",
    trackInventory: false,
    onHand: 0,
    ...overrides
  }
}

// The Products list: priced per unit, per pack and in two currencies, one without a price, one archived.
export const productRows: ProductRow[] = [
  {
    id: id("2f8c6b14", 1),
    title: "Canvas tote bag",
    category: "Bags",
    productCode: "TOTE",
    images: [photo],
    status: "active",
    catalogs: 2,
    variants: [
      rowVariant("LM-TOTE-NAT", { trackInventory: true, onHand: 120 }),
      rowVariant("LM-TOTE-BLK", { priceMinor: 450, trackInventory: true, onHand: 40 })
    ]
  },
  {
    id: id("2f8c6b14", 2),
    title: "Linen apron",
    category: "Kitchen",
    productCode: "APRON",
    images: [],
    status: "active",
    catalogs: 1,
    variants: [rowVariant("LM-APRON", { priceMinor: 5340, priceBasis: "sellable_pack" })]
  },
  {
    id: id("2f8c6b14", 3),
    title: "Market basket",
    category: null,
    productCode: null,
    images: [],
    status: "active",
    catalogs: 0,
    variants: [rowVariant("LM-BASKET", { priceMinor: null, trackInventory: true, onHand: 0 })]
  },
  {
    id: id("2f8c6b14", 4),
    title: "Wool throw",
    category: "Home",
    productCode: "THROW",
    images: [],
    status: "archived",
    catalogs: 0,
    variants: [rowVariant("LM-THROW-US"), rowVariant("LM-THROW-EU", { currency: "EUR", priceMinor: 3900 })]
  }
]

// More products than one page of the list holds.
export function manyProductRows(count: number): ProductRow[] {
  return Array.from({ length: count }, (_, index) => ({
    ...productRows[1]!,
    id: id("2f8c6b16", index + 1),
    title: `Stoneware mug ${String(index + 1).padStart(2, "0")}`,
    variants: [rowVariant(`LM-MUG-${index + 1}`)]
  }))
}

function editorVariant(key: string, overrides: Partial<EditorVariant>): EditorVariant {
  return {
    key,
    id: key,
    supplierSku: "",
    options: {},
    currency: "USD",
    priceMinor: 425,
    priceBasis: "piece",
    piecesPerSellablePack: 1,
    sellablePacksPerCase: 24,
    trackInventory: true,
    onHand: 120,
    continueSelling: false,
    priceBreaks: [],
    quantityRules: defaultQuantityRules,
    notes: "",
    ...overrides
  }
}

// The tote's product page: two colors, two photos, and its catalogs.
export const toteProduct: EditorProduct = {
  id: id("2f8c6b14", 1),
  revision: 4,
  title: "Canvas tote bag",
  status: "active",
  category: "Bags",
  productCode: "TOTE",
  url: "https://lotus.example.com/tote",
  description: "Heavy canvas with a flat bottom.",
  optionNames: ["Color"],
  images: [photo, image("tote-back.png")],
  variants: [
    editorVariant(id("9d51b7c2", 1), { supplierSku: "LM-TOTE-NAT", options: { Color: "Natural" } }),
    editorVariant(id("9d51b7c2", 2), {
      supplierSku: "LM-TOTE-BLK",
      options: { Color: "Black" },
      priceMinor: 450,
      onHand: 40,
      priceBreaks: [{ minimum: 100, priceMinor: 420 }]
    })
  ]
}

export const productCatalogs = [
  { id: catalogIds.wholesale, title: "Wholesale 2026", status: "active" as const },
  { id: catalogIds.retail, title: "Retail partners", status: "draft" as const }
]

type Changes = ReturnType<typeof proposalChanges>

// A supplier's proposed changes: more totes at a new price, an added basket, a removed apron and one line as it was,
// with new payment terms and ready date.
export const proposedChanges: Changes = {
  lines: [
    {
      key: "item-tote",
      name: "Canvas tote bag / Natural",
      supplierSku: "LM-TOTE-NAT",
      change: "changed",
      before: { pieces: 240, unitPrice: 425 },
      after: { pieces: 300, unitPrice: 410 }
    },
    {
      key: "item-mug",
      name: "Stoneware mug",
      supplierSku: "LM-MUG",
      change: "same",
      before: { pieces: 48, unitPrice: 600 },
      after: { pieces: 48, unitPrice: 600 }
    },
    {
      key: "LM-BASKET",
      name: "Market basket",
      supplierSku: "LM-BASKET",
      change: "added",
      before: null,
      after: { pieces: 60, unitPrice: 1450 }
    },
    {
      key: "item-apron",
      name: "Linen apron / Charcoal",
      supplierSku: "LM-APRON",
      change: "removed",
      before: { pieces: 120, unitPrice: 890 },
      after: null
    }
  ],
  paymentTerms: { before: "Net 30", after: "Net 15" },
  readyDate: { before: null, after: "2026-11-02" },
  total: { before: 237_600, after: 238_800 }
}

type ReviserItems = ComponentProps<typeof OrderReviser>["items"]

// A sent purchase order's lines as the edit page starts them. The apron comes in sixes.
export const reviserItems: ReviserItems = [
  {
    itemId: "item-tote",
    name: "Canvas tote bag",
    variant: "Natural",
    supplierSku: "LM-TOTE-NAT",
    piecesPerSet: 1,
    pieces: 240,
    unitPrice: 425,
    original: { pieces: 240, unitPrice: 425 }
  },
  {
    itemId: "item-apron",
    name: "Linen apron",
    variant: "Charcoal",
    supplierSku: "LM-APRON",
    piecesPerSet: 6,
    pieces: 120,
    unitPrice: 890,
    original: { pieces: 120, unitPrice: 890 }
  }
]

// Products the supplier can add, at the customer's prices.
export const reviserProducts: ReviserProduct[] = [
  { supplierSku: "LM-BASKET", title: "Market basket", unitPrice: 1450, minimumPieces: 12 },
  { supplierSku: "LM-MUG", title: "Stoneware mug", unitPrice: null, minimumPieces: 1 },
  { supplierSku: "LM-TOTE-NAT", title: "Canvas tote bag, Natural", unitPrice: 425, minimumPieces: 1 }
]

// The Overview's last 30 days against the 30 before, ending today.
function overviewPeriod(): SupplierOverviewData["period"] {
  const today = new Date().toISOString().slice(0, 10)
  const period = readPeriod({}, today)
  return {
    key: period.key,
    range: period.range,
    label: period.label,
    comparison: period.comparison,
    comparisonLabel: "Previous period",
    previousLabel: null,
    today
  }
}

function overviewSeries(range: { from: string; to: string }) {
  const series: SupplierOverviewData["series"] = []
  for (let day = range.from, index = 0; day <= range.to; day = addDays(day, 1), index += 1) {
    const busy = index % 4 === 0
    series.push({
      day,
      value: busy ? 40_000 + index * 1500 : 0,
      orders: busy ? 1 + (index % 3) : 0,
      previous: index % 5 === 0 ? 30_000 : 0
    })
  }
  return series
}

// A busy supplier's Overview: orders at every stage, a short variant, unpriced products and a customer without a
// catalog.
export function overviewData(): SupplierOverviewData {
  const period = overviewPeriod()
  return {
    currency: "USD",
    period,
    kpis: {
      orders: { value: 14, change: 0.27 },
      value: { value: 1_842_000, change: -0.12 },
      pieces: { value: 5_280, change: 0.05 },
      shipped: { value: 3_960, change: null }
    },
    series: overviewSeries(period.range),
    pipeline: [
      { key: "pack", orders: 2, pieces: 520 },
      { key: "waiting", orders: 1, pieces: 276 },
      { key: "ship", orders: 1, pieces: 288 },
      { key: "shipped", orders: 0, pieces: 0 }
    ],
    backlog: { orders: 4, pieces: 1_084, value: [{ currency: "USD", amount: 412_000 }] },
    topProducts: [
      {
        sku: "LM-TOTE-NAT",
        title: "Canvas tote bag (Natural)",
        groupId: id("2f8c6b14", 1),
        pieces: 2_400,
        value: 1_020_000
      },
      { sku: "LM-APRON", title: "Linen apron", groupId: id("2f8c6b14", 2), pieces: 720, value: 640_800 },
      { sku: "LM-OLD", title: "LM-OLD", groupId: null, pieces: 60, value: 0 }
    ],
    topCustomers: [
      { id: customerIds.harbor, name: "Harbor Goods", orders: 9, value: 1_284_000 },
      { id: customerIds.summit, name: "Summit Outfitters", orders: 5, value: 558_000 }
    ],
    inventory: {
      tracked: 3,
      short: 1,
      out: 1,
      low: 1,
      healthy: 0,
      unlimited: 1,
      value: [{ currency: "USD", amount: 68_000 }],
      watch: [inventoryRows[1]!, inventoryRows[0]!]
    },
    attention: { pack: 2, ship: 1, short: 1, unpriced: 1, uncatalogued: 1 },
    recent: supplierOrders.slice(0, 5)
  }
}

// A new supplier's Overview, before any orders or tracked stock.
export function quietOverviewData(): SupplierOverviewData {
  const data = overviewData()
  return {
    ...data,
    kpis: {
      orders: { value: 0, change: null },
      value: { value: 0, change: null },
      pieces: { value: 0, change: null },
      shipped: { value: 0, change: null }
    },
    series: data.series.map((day) => ({ ...day, value: 0, orders: 0, previous: null })),
    pipeline: data.pipeline.map((row) => ({ ...row, orders: 0, pieces: 0 })),
    backlog: { orders: 0, pieces: 0, value: [] },
    topProducts: [],
    topCustomers: [],
    inventory: { tracked: 0, short: 0, out: 0, low: 0, healthy: 0, unlimited: 0, value: [], watch: [] },
    attention: { pack: 0, ship: 0, short: 0, unpriced: 0, uncatalogued: 0 },
    recent: []
  }
}

// Members of the supplier's team: one who views catalogs with their prices, and one who assigns catalogs to customers
// without seeing prices.
export const catalogViewer: Permissions = {
  role: "member",
  access: { catalogs: "view", customers: "view", prices: "view" }
}
export const customerEditor: Permissions = { role: "member", access: { customers: "edit" } }
