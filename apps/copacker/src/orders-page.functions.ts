import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { ordersPage } from "@/server/orders-page"
import { localizedPage } from "@/server/page-result"
export const readOrders = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) =>
    localizedPage(
      () => ordersPage(data),
      (page) => (page.view === "supplier" ? "orders.index.supplierTitle" : "orders.index.title")
    )
  )
