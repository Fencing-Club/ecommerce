import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { orderPage } from "@/server/order-page"
import { pageResult } from "@/server/page-result"
export const readOrder = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => pageResult(() => orderPage(data), "orders.index.title"))
