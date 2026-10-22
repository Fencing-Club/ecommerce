import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { session } from "@/server/auth"
import { pageResult } from "@/server/page-result"
import { shipmentPacketResult } from "@/server/shipment-packet"

export const readShipmentPacket = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) =>
    pageResult(async () => shipmentPacketResult(await session(), data.id), "shipments.detail.packet.title")
  )
