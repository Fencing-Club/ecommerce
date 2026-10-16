import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { pageResult } from "@/server/page-result"
import { shipmentsPage } from "@/server/shipments-page"
export const readShipments = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) => pageResult(() => shipmentsPage(data)))
