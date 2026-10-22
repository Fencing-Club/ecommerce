import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { failureMessage, failureStatus } from "@/server/errors"
import { proposeChanges } from "@/server/order-proposals"

const input = z.object({ revision: z.number().int().positive(), proposal: z.unknown() })

// The supplier sends its changes to a PO for the buyer to approve.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { revision, proposal } = input.parse(await request.json())
    const id = z.uuid().parse(params.id)
    const s = await session()
    requireAccess(s, "orders", "edit")
    return Response.json(await proposeChanges(s, id, proposal, revision))
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "changesNotSent") }, { status: failureStatus(error) })
  }
}
