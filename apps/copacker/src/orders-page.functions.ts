import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { ordersPage } from "@/server/orders-page"
import { pageResult } from "@/server/page-result"
export const readOrders = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) => pageResult(() => ordersPage(data)))
