import { z } from "zod"
import { session } from "@/server/auth"
import { errorResponse, StatusError } from "@/server/errors"
import { packingList } from "@/server/packing-list"

const headers = { "Cache-Control": "private, no-store" }

// A packed shipment's packing list, as the document data the browser renders into its PDF.
export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = z.uuid().safeParse((await context.params).id)
  if (!id.success) {
    return errorResponse("shipmentNotFound", 404, headers)
  }
  const s = await session()
  try {
    return Response.json({ data: await packingList(s, id.data) }, { headers })
  } catch (error) {
    if (error instanceof StatusError) {
      return errorResponse(error.key, error.status, headers)
    }
    throw error
  }
}
