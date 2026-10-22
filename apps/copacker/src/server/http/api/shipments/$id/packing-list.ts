import { z } from "zod"
import { session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { packingList } from "@/server/packing-list"

// A packed shipment's packing list, as the document data the browser renders into its PDF.
export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = z.uuid().safeParse(context.params.id)
  if (!id.success) {
    return errorResponse("shipmentNotFound", 404)
  }
  const s = await session()
  return Response.json({ data: await packingList(s, id.data) })
}
