import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { localizedPage } from "@/server/page-result"
import { reviseOrderPage } from "@/server/revise-order-page"
export const readReviseOrder = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => localizedPage(() => reviseOrderPage(data), "orders.revise.title"))
