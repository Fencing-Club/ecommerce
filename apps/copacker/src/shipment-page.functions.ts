import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { localizedPage } from "@/server/page-result"
import { shipmentPage } from "@/server/shipment-page"
export const readShipment = createServerFn()
  .validator(z.object({ query: urlQuery, id: z.string().max(128) }))
  .handler(({ data }) => localizedPage(() => shipmentPage(data), "shipments.detail.metaTitle"))
