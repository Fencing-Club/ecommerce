import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { orderPage } from "@/server/order-page"
import { pageResult } from "@/server/page-result"
export const readOrder = createServerFn()
  .validator(z.object({ query: urlQuery, id: z.string().max(128) }))
  .handler(({ data }) => pageResult(() => orderPage(data)))
