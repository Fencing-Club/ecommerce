import { http, HttpResponse } from "msw/http"
import { workspaces } from "@/stories/workspace"

// What the app's API answers in every story unless the story says otherwise (with msw.use in its beforeEach): each
// change succeeds, and lists come back empty.
export const handlers = [
  http.post("/api/action", () => HttpResponse.json({ ok: true })),
  http.get("/api/workspace", () => HttpResponse.json({ id: workspaces.buyer.id })),
  http.get("/api/search", () => HttpResponse.json({ orders: [], shipments: [], products: [], partners: [] })),
  http.get("/api/restock/suppliers", () => HttpResponse.json([])),
  http.get("/api/maintenance", () => HttpResponse.json({ active: false })),
  http.get("/api/sales/orders", () => HttpResponse.json({ orders: [] })),
  http.get("/api/catalog", () => HttpResponse.json([]))
]
