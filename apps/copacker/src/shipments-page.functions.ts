import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { localizedPage } from "@/server/page-result"
import { shipmentsPage } from "@/server/shipments-page"
export const readShipments = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) => localizedPage(() => shipmentsPage(data), "shipments.list.title"))
