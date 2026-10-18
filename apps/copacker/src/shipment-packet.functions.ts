import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { session } from "@/server/auth"
import { localizedPage } from "@/server/page-result"
import { shipmentPacketResult } from "@/server/shipment-packet"

export const readShipmentPacket = createServerFn()
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    localizedPage(async () => shipmentPacketResult(await session(), data.id), "shipments.detail.packet.title")
  )
