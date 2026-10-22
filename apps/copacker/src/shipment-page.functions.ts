import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { pageResult } from "@/server/page-result"
import { shipmentPage } from "@/server/shipment-page"
export const readShipment = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => pageResult(() => shipmentPage(data), "shipments.detail.metaTitle"))
