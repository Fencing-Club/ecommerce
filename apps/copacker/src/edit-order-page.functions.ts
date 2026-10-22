import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { editOrderPage } from "@/server/edit-order-page"
import { pageResult } from "@/server/page-result"
export const readEditOrder = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => pageResult(() => editOrderPage(data), "orders.builder.edit"))
