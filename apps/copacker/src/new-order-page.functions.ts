import { createServerFn } from "@tanstack/react-start"
import { newOrderSearch } from "@/lib/page-search"
import { newOrderPage } from "@/server/new-order-page"
import { pageResult } from "@/server/page-result"
export const readNewOrder = createServerFn()
  .validator(newOrderSearch)
  .handler(({ data }) => pageResult(() => newOrderPage(data), "orders.builder.newTitle"))
