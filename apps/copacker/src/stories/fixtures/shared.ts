import { delay, http, HttpResponse } from "msw"
import type { SetupWorker } from "msw/browser"
import type { SalesOrderSummary } from "@/server/sales-orders"
import type { SearchIndex } from "@/server/search"
import { daysAgo } from "./orders"

// Answers the app's changes (POST /api/action) with `answer`, and keeps each request's body for the play function to
// check. The default answer is a success.
export function recordActions(
  msw: SetupWorker,
  answer: () => Response | Promise<Response> = () => HttpResponse.json({ ok: true })
) {
  const bodies: unknown[] = []
  msw.use(
    http.post("/api/action", async ({ request }) => {
      bodies.push(await request.json())
      return answer()
    })
  )
  return bodies
}

// An answer that never comes, for a story that stays on what shows while a request is on its way, or that would
// otherwise leave the page (such as after deleting a workspace).
export async function held(): Promise<Response> {
  await delay("infinite")
  return HttpResponse.json({ ok: true })
}

// What the header's search looks through for a buyer: purchase orders (newest first), their shipments, products and
// partners.
export const searchIndex: SearchIndex = {
  orders: [
    { id: "order-1046", reference: "PO-1046", supplier: "Lotus Manufacturing", status: "draft", amazonIds: [] },
    {
      id: "order-1045",
      reference: "PO-1045",
      supplier: "Lotus Manufacturing",
      status: "submitted",
      amazonIds: ["FBA17XK2Q9LP"]
    },
    { id: "order-1044", reference: "PO-1044", supplier: "Northwind Textiles", status: "submitted", amazonIds: [] },
    { id: "order-1043", reference: "PO-1043", supplier: "Northwind Textiles", status: "closed", amazonIds: [] },
    { id: "order-1042", reference: "PO-1042", supplier: "Lotus Manufacturing", status: "closed", amazonIds: [] },
    { id: "order-1041", reference: "PO-1041", supplier: "Lotus Manufacturing", status: "closed", amazonIds: [] }
  ],
  shipments: [
    {
      id: "shipment-1",
      title: "FBA17XK2Q9LP",
      reference: "PO-1045",
      status: "shipped",
      keywords: ["PO-1045", "FBA17XK2Q9LP", "BK-88213"]
    },
    { id: "shipment-2", title: "Shipment 1", reference: "PO-1044", status: "packing", keywords: ["PO-1044"] }
  ],
  products: [
    { id: "product-tote", title: "Canvas tote bag", imageUrl: null, keywords: ["Natural", "TOTE-001", "TOTE-002"] },
    { id: "product-apron", title: "Linen apron", imageUrl: null, keywords: ["Charcoal", "APRON-001"] }
  ],
  partners: [
    { id: "partner-lotus", name: "Lotus Manufacturing", type: "supplier", keywords: ["Lotus Mfg", "Mei Chen"] },
    { id: "partner-bayline", name: "Bayline Freight", type: "forwarder", keywords: ["Jordan Blake"] }
  ]
}

function salesOrder(number: string, channel: string, status: string, days: number): SalesOrderSummary {
  return {
    source: "shopify",
    orderId: `gid://shopify/Order/${number.replace("#", "")}`,
    number,
    orderedAt: daysAgo(days).toISOString(),
    units: 2,
    items: [{ sku: "TOTE-001", name: "Canvas tote bag / Natural", quantity: 2 }],
    channel,
    status,
    url: `https://admin.shopify.com/store/harbor-goods/orders/${number.replace("#", "")}`,
    sales: { minor: 5800, currency: "USD" },
    fees: null
  }
}

// Sales orders the Orders page's search finds for "#10".
export const salesOrders = [
  salesOrder("#1042", "Online Store", "Fulfilled", 2),
  salesOrder("#1017", "Online Store", "Unfulfilled", 5)
]
