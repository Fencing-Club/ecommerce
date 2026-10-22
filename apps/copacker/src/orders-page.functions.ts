import { createServerFn } from "@tanstack/react-start"
import { ordersPage } from "@/server/orders-page"
import { pageResult } from "@/server/page-result"
export const readOrders = createServerFn().handler(() =>
  pageResult(ordersPage, (page) => (page.view === "supplier" ? "orders.index.supplierTitle" : "orders.index.title"))
)
