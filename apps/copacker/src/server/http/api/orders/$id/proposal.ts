import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { requestInput, requestJson } from "@/server/errors"
import { proposeChanges } from "@/server/order-proposals"

const input = z.object({ revision: z.number().int().positive(), proposal: z.unknown() })

// The supplier sends its changes to a PO for the buyer to approve.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { revision, proposal } = requestInput(input, await requestJson(request))
  const id = requestInput(z.uuid(), params.id)
  const s = await session()
  requireAccess(s, "orders", "edit")
  return Response.json(await proposeChanges(s, id, proposal, revision))
}
