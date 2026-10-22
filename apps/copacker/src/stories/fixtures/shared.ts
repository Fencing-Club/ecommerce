import type { SearchIndex } from "@/server/search"

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
