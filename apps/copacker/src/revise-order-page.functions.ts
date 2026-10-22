import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { pageResult } from "@/server/page-result"
import { reviseOrderPage } from "@/server/revise-order-page"
export const readReviseOrder = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => pageResult(() => reviseOrderPage(data), "orders.revise.title"))
