import type { EditableProduct } from "@/components/product-details"
import type { EditorProduct } from "@/components/supplier/product-editor"
import type { ProductRow } from "@/components/supplier/product-index"
import type { SupplierOption } from "@/lib/api"
import type { AmazonOnlyStock } from "@/server/inventory-products"
import type { InventoryProduct, InventoryVariant } from "@/server/inventory-products"
import type { ProductBarcode } from "@/server/product-barcodes"
import type { ProductDefaults } from "@/server/product-defaults"
import type { ProductWithoutSupplier } from "@/server/product-suppliers"
import type { RestockChannel } from "@/server/restock-plan"
import type { RestockLine } from "@/server/restock-plan"
import type { SalesOrderSummary } from "@/server/sales-orders"
import type { InventoryRow } from "@/server/supplier-workspace"
import { daysAgo, supplierId } from "./orders"

// A buyer's products, stock, restock suggestions and sales orders, and a supplier's products, as the API and the
// database return them, for stories.

const lotus: SupplierOption = { id: supplierId, name: "Lotus Manufacturing", leadTimeDays: 45 }
const northwind: SupplierOption = {
  id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a03",
  name: "Northwind Textiles",
  leadTimeDays: null
}
export const suppliers = [lotus, northwind]

export function productDefaults(overrides: Partial<ProductDefaults> = {}): ProductDefaults {
  return {
    description: "",
    prepCategory: null,
    casePacks: [],
    caseQuantity: null,
    minimumOrder: null,
    supplierId: null,
    productLabel: "standard",
    suffocationWarning: false,
    amazonNetwork: "fba",
    revision: 3,
    ...overrides
  }
}

export const uploadedBarcode: ProductBarcode = {
  name: "APRON-CHR.pdf",
  bytes: 48210,
  uploadedAt: daysAgo(5).toISOString()
}

// A variation as the products API lists it: its stock and the details Copacker keeps for it.
type ListedVariant = InventoryVariant & {
  barcode: ProductBarcode | null
  fnsku: string | null
  supplierSku: string | null
  asin: string | null
  storeStockTarget: number | null
  countryOfOrigin?: string | null
}
type ListedProduct = Omit<InventoryProduct, "variants"> & { defaults: ProductDefaults; variants: ListedVariant[] }

function variant(id: number, overrides: Partial<ListedVariant> = {}): ListedVariant {
  return {
    variantId: `gid://shopify/ProductVariant/${id}`,
    title: null,
    sku: null,
    imageUrl: null,
    stock: "tracked",
    available: 40,
    onHand: 44,
    incoming: 0,
    onOrder: { units: 0, orders: [] },
    amazonStockTarget: null,
    levels: [],
    barcode: null,
    fnsku: null,
    supplierSku: null,
    asin: null,
    storeStockTarget: null,
    countryOfOrigin: "US",
    ...overrides
  }
}

const level = (locationId: string, locationName: string, available: number) => ({
  locationId,
  locationName,
  classification: "merchant" as const,
  available,
  onHand: available,
  incoming: 0
})

// A product from its variations: its totals add up theirs.
function product(id: number, title: string, variants: ListedVariant[], defaults = productDefaults()): ListedProduct {
  const total = (pick: (item: ListedVariant) => number | null) => {
    const known = variants.map(pick).filter((value) => value !== null)
    return known.length ? known.reduce((sum, value) => sum + value, 0) : null
  }
  return {
    productId: `gid://shopify/Product/${id}`,
    title,
    imageUrl: null,
    stock: variants.every((item) => item.stock === variants[0]!.stock) ? variants[0]!.stock : "tracked",
    available: total((item) => item.available),
    onHand: total((item) => item.onHand),
    incoming: total((item) => item.incoming),
    onOrder: {
      units: variants.reduce((sum, item) => sum + item.onOrder.units, 0),
      orders: variants.flatMap((item) => item.onOrder.orders)
    },
    defaults,
    variants
  }
}

const toteOrder = { id: "order-PO-1045", reference: "PO-1045" }

export const listedProducts: ListedProduct[] = [
  product(
    501,
    "Canvas tote bag",
    [
      variant(1001, {
        title: "Natural",
        sku: "TOTE-NAT",
        fnsku: "X00TOTE001",
        available: 120,
        onHand: 130,
        incoming: 60,
        onOrder: { units: 240, orders: [toteOrder] },
        amazonStockTarget: 50,
        levels: [level("81234", "Harbor Warehouse", 80), level("81235", "Downtown Store", 40)],
        supplierSku: "LM-TOTE-001",
        asin: "B0TOTE0001"
      }),
      variant(1002, { title: "Black", sku: "TOTE-BLK", available: -4, onHand: 0, countryOfOrigin: null })
    ],
    productDefaults({ supplierId: lotus.id, caseQuantity: 24 })
  ),
  product(
    502,
    "Linen apron",
    [variant(1003, { sku: "APRON-CHR", available: 18, onHand: 20, amazonStockTarget: 0 })],
    productDefaults({ productLabel: "uploaded" })
  ),
  product(503, "Gift card", [
    variant(1004, { sku: "GIFT", stock: "untracked", available: null, onHand: null, incoming: null })
  ]),
  product(504, "Market basket 2-pack", [variant(1005, { sku: "BASKET-2", stock: "bundle" })])
]

export const amazonOnlyStock: AmazonOnlyStock[] = [
  {
    sku: "amzn.gr.TOTE-NAT-used",
    fba: { available: 3, onHand: 3, incoming: 0 },
    awd: null,
    resold: true
  }
]

// A page of the products API.
export function productsPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    observedAt: daysAgo(0).toISOString(),
    page: 1,
    pageSize: 25,
    totalPages: 1,
    totalProducts: listedProducts.length,
    totalVariants: 5,
    missingBarcodes: 1,
    missingCountries: 1,
    duplicateSkus: [],
    products: listedProducts,
    amazonOnly: [],
    ...overrides
  }
}

// A product as its details panel edits it.
export function editable(index: number): EditableProduct {
  const { productId, title, imageUrl, defaults, variants } = listedProducts[index]!
  return { productId, title, imageUrl, defaults, variants }
}

export const withoutSupplier: ProductWithoutSupplier[] = [
  { productId: "gid://shopify/Product/502", title: "Linen apron", imageUrl: null, skus: ["APRON-CHR"] },
  {
    productId: "gid://shopify/Product/505",
    title: "Cotton napkins",
    imageUrl: null,
    skus: ["NAPKIN-1", "NAPKIN-2", "NAPKIN-3", "NAPKIN-4", "NAPKIN-5"]
  },
  { productId: "gid://shopify/Product/506", title: "Jute twine", imageUrl: null, skus: [] }
]

export const restockChannels: { key: string; label: string; channel: RestockChannel }[] = [
  { key: "amazon", label: "Amazon", channel: { kind: "amazon" } },
  { key: "shopify:81234", label: "Harbor Warehouse", channel: { kind: "shopify", locationId: "81234" } }
]

let lineCount = 0

function restockLine(overrides: Partial<RestockLine>): RestockLine {
  lineCount += 1
  return {
    variantId: `gid://shopify/ProductVariant/${2000 + lineCount}`,
    productId: null,
    product: "Canvas tote bag",
    variant: null,
    sku: null,
    imageUrl: null,
    packOf: null,
    supplier: lotus,
    externalSupplier: null,
    status: "stocked",
    blocked: [],
    sold: 60,
    soldAlone: null,
    soldInBundles: null,
    soldOnEbay: null,
    salesDays: 60,
    stockoutDays: 0,
    rateDays: 60,
    leadTimeDays: 45,
    available: 200,
    incoming: 0,
    targetStock: null,
    targetWhere: null,
    minimumOrder: null,
    caseQuantity: null,
    casePack: null,
    need: 0,
    purchaseUnits: 0,
    caseCount: null,
    unitCostMinor: 425,
    costCurrency: "USD",
    estimatedCostMinor: 0,
    daysRemaining: 200,
    priceMinor: 1800,
    priceCurrency: "USD",
    lostDays: null,
    lostUnits: 0,
    lostSalesMinor: null,
    lostProfitMinor: null,
    ...overrides
  }
}

const toteCase = { name: "Standard case", units: 24, lengthCm: 40, widthCm: 30, heightCm: 30, weightKg: 6 }

export const restockLines: RestockLine[] = [
  restockLine({
    variant: "Natural",
    sku: "TOTE-NAT",
    status: "stockout",
    sold: 120,
    stockoutDays: 6,
    rateDays: 54,
    available: 0,
    incoming: 24,
    daysRemaining: 0,
    need: 76,
    caseQuantity: 24,
    casePack: toteCase,
    purchaseUnits: 96,
    caseCount: 4,
    estimatedCostMinor: 40800,
    lostDays: 12,
    lostUnits: 27,
    lostSalesMinor: 48600
  }),
  restockLine({
    variant: "Black",
    sku: "TOTE-BLK",
    status: "reorder",
    sold: 90,
    available: 80,
    daysRemaining: 53,
    need: 20,
    caseQuantity: 24,
    casePack: toteCase,
    purchaseUnits: 24,
    caseCount: 1,
    estimatedCostMinor: 10200
  }),
  restockLine({
    product: "Linen apron",
    sku: "APRON-CHR",
    supplier: northwind,
    status: "stockout",
    sold: 45,
    available: 10,
    daysRemaining: 13,
    need: 25,
    minimumOrder: 50,
    purchaseUnits: 50,
    unitCostMinor: null,
    costCurrency: null,
    estimatedCostMinor: null,
    targetStock: 20,
    targetWhere: "Amazon",
    lostDays: 32,
    lostUnits: 24,
    priceMinor: null,
    priceCurrency: null
  }),
  restockLine({ product: "Market basket", variant: "Large", sku: "BASKET-L", status: "stocked" }),
  restockLine({
    product: "Cotton napkins",
    sku: "NAPKIN-4",
    supplier: northwind,
    status: "blocked",
    blocked: ["stock_unknown", "incoming_unknown"],
    available: null,
    incoming: null,
    need: null,
    purchaseUnits: null,
    daysRemaining: null,
    lostUnits: null
  }),
  restockLine({
    product: "Jute twine",
    sku: "TWINE-50",
    packOf: 2,
    supplier: null,
    externalSupplier: "Coastal Paper",
    status: "reorder",
    sold: 30,
    available: 20,
    daysRemaining: 40,
    need: 14,
    purchaseUnits: 14,
    estimatedCostMinor: 5950
  }),
  restockLine({
    product: "Stoneware mug",
    sku: "MUG-01",
    status: "no_listing",
    targetStock: 20,
    purchaseUnits: null,
    available: null
  }),
  restockLine({ product: "Olive soap", sku: "SOAP-01", status: "not_stocked", sold: 0, daysRemaining: null })
]

export function restockReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    days: 60,
    leadTimeDays: 60,
    channel: restockChannels[0]!.channel,
    supplier: "all",
    needsSupplier: 2,
    suppliers,
    sources: [
      {
        source: "amazon",
        error: null,
        window: { from: daysAgo(60).toISOString(), to: daysAgo(0).toISOString() },
        gapUnits: 0,
        gapReasons: {}
      }
    ],
    lines: restockLines,
    ...overrides
  }
}

// An order sync's state, as the sales API reports it.
export function syncState(source: "shopify" | "amazon", overrides: Partial<Record<string, unknown>> = {}) {
  return {
    source,
    externalAccountId: source === "shopify" ? "harbor-goods.myshopify.com" : "A1B2C3D4E5",
    status: "idle",
    errorCode: null,
    coveredFrom: daysAgo(365).toISOString(),
    coveredTo: daysAgo(0).toISOString(),
    finishedAt: daysAgo(0).toISOString(),
    progress: null,
    orders: 1240,
    recent: source === "shopify" ? { orders: 184, units: 412 } : { orders: 320, units: 655 },
    ...overrides
  }
}

function salesOrder(number: string, overrides: Partial<SalesOrderSummary> = {}): SalesOrderSummary {
  return {
    source: "shopify",
    orderId: `order-${number}`,
    number,
    orderedAt: daysAgo(1).toISOString(),
    units: 2,
    items: [{ sku: "TOTE-NAT", name: "Canvas tote bag, Natural", quantity: 2 }],
    channel: "Online Store",
    status: "Fulfilled",
    url: `https://admin.shopify.com/store/harbor-goods/orders/${number.slice(1)}`,
    sales: { minor: 3600, currency: "USD" },
    fees: { minor: 134, currency: "USD" },
    ...overrides
  }
}

export const salesOrders: SalesOrderSummary[] = [
  salesOrder("#1042"),
  salesOrder("#1041", {
    status: "Unfulfilled",
    units: 7,
    items: [
      { sku: "TOTE-NAT", name: "Canvas tote bag, Natural", quantity: 2 },
      { sku: "APRON-CHR", name: "Linen apron", quantity: 1 },
      { sku: "BASKET-L", name: null, quantity: 2 },
      { sku: "NAPKIN-4", name: "Cotton napkins", quantity: 2 }
    ],
    sales: { minor: 12950, currency: "USD" }
  }),
  salesOrder("113-4827710-1234567", {
    source: "amazon",
    channel: "Amazon.com",
    status: "Pending",
    url: "https://sellercentral.amazon.com/orders-v3/order/113-4827710-1234567",
    sales: null,
    fees: null
  }),
  salesOrder("113-9921034-7654321", {
    source: "amazon",
    channel: "Amazon.com",
    status: "Shipped",
    replacementOf: "113-4827710-1111111",
    url: "https://sellercentral.amazon.com/orders-v3/order/113-9921034-7654321",
    items: [{ sku: null, quantity: 1 }]
  }),
  salesOrder("#1039", { status: "Cancelled", sales: null, fees: null })
]

// A supplier's products, as their Products page lists them.
export const supplierProducts: ProductRow[] = [
  {
    id: "7a3e1c52-1d0b-4b8f-9d3e-0000000000a1",
    title: "Canvas tote bag",
    category: "Bags",
    productCode: "LM-TOTE",
    images: [],
    status: "active",
    catalogs: 2,
    variants: [
      {
        supplierSku: "LM-TOTE-001",
        currency: "USD",
        priceMinor: 425,
        priceBasis: "piece",
        trackInventory: true,
        onHand: 1200
      },
      {
        supplierSku: "LM-TOTE-002",
        currency: "USD",
        priceMinor: 450,
        priceBasis: "piece",
        trackInventory: true,
        onHand: 300
      }
    ]
  },
  {
    id: "7a3e1c52-1d0b-4b8f-9d3e-0000000000a2",
    title: "Linen apron",
    category: "Kitchen",
    productCode: null,
    images: [],
    status: "archived",
    catalogs: 0,
    variants: [
      {
        supplierSku: "LM-APRON-002",
        currency: "USD",
        priceMinor: 890,
        priceBasis: "piece",
        trackInventory: false,
        onHand: 0
      }
    ]
  }
]

// A supplier's product as its page edits it.
export const editorProduct: EditorProduct = {
  id: "7a3e1c52-1d0b-4b8f-9d3e-0000000000a1",
  revision: 4,
  title: "Canvas tote bag",
  status: "active",
  category: "Bags",
  productCode: "LM-TOTE",
  url: "",
  description: "Heavy cotton canvas with long handles.",
  optionNames: ["Color"],
  images: [],
  variants: [
    {
      key: "variant-natural",
      id: "7a3e1c52-1d0b-4b8f-9d3e-0000000000b1",
      supplierSku: "LM-TOTE-001",
      options: { Color: "Natural" },
      currency: "USD",
      priceMinor: 425,
      priceBasis: "piece",
      piecesPerSellablePack: 1,
      sellablePacksPerCase: 24,
      trackInventory: true,
      onHand: 1200,
      continueSelling: false,
      priceBreaks: [{ minimum: 500, priceMinor: 395 }],
      quantityRules: { increment: 1, minimum: 1, maximum: null },
      notes: ""
    }
  ]
}

const photo = { key: "supplier-products/tote.jpg", name: "tote.jpg", contentType: "image/jpeg" }

// A supplier's stock, as their Inventory page lists it.
export const supplierInventory: InventoryRow[] = [
  {
    id: "7a3e1c52-1d0b-4b8f-9d3e-0000000000b1",
    groupId: "7a3e1c52-1d0b-4b8f-9d3e-0000000000a1",
    supplierSku: "LM-TOTE-001",
    trackInventory: true,
    onHand: 1200,
    continueSelling: false,
    revision: 4,
    title: "Canvas tote bag",
    variant: "Natural",
    image: photo,
    committed: 400,
    available: 800
  },
  {
    id: "7a3e1c52-1d0b-4b8f-9d3e-0000000000b2",
    groupId: "7a3e1c52-1d0b-4b8f-9d3e-0000000000a1",
    supplierSku: "LM-TOTE-002",
    trackInventory: true,
    onHand: 100,
    continueSelling: false,
    revision: 2,
    title: "Canvas tote bag",
    variant: "Black",
    image: photo,
    committed: 240,
    available: -140
  },
  {
    id: "7a3e1c52-1d0b-4b8f-9d3e-0000000000b3",
    groupId: "7a3e1c52-1d0b-4b8f-9d3e-0000000000a2",
    supplierSku: "LM-APRON-002",
    trackInventory: false,
    onHand: 0,
    continueSelling: true,
    revision: 1,
    title: "Linen apron",
    variant: null,
    image: photo,
    committed: 0,
    available: 0
  }
]
