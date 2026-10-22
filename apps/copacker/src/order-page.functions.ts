import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { orderPage } from "@/server/order-page"
import { localizedPage } from "@/server/page-result"
export const readOrder = createServerFn()
  .validator(z.object({ query: urlQuery, id: z.string() }))
  .handler(({ data }) => localizedPage(() => orderPage(data), "orders.index.title"))
