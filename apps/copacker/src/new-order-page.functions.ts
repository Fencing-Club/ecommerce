import { createServerFn } from "@tanstack/react-start"
import { urlQuery } from "@/lib/url-query"
import { newOrderPage } from "@/server/new-order-page"
import { localizedPage } from "@/server/page-result"
export const readNewOrder = createServerFn()
  .validator(urlQuery)
  .handler(({ data }) => localizedPage(() => newOrderPage(data), "orders.builder.newTitle"))
