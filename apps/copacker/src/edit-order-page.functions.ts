import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { editOrderPage } from "@/server/edit-order-page"
import { localizedPage } from "@/server/page-result"
export const readEditOrder = createServerFn()
  .validator(z.object({ id: z.string().max(128) }))
  .handler(({ data }) => localizedPage(() => editOrderPage(data), "orders.builder.edit"))
