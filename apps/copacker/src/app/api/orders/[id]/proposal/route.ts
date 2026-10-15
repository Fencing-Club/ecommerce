import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { withRequest } from "@/server/next-request"
import { proposeChanges } from "@/server/order-proposals"
import { isAppOrigin } from "@/server/security"

const input = z.object({ revision: z.number().int().positive(), proposal: z.unknown() })

// The supplier sends its changes to a PO for the buyer to approve.
export const POST = withRequest(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  try {
    const { revision, proposal } = input.parse(await request.json())
    const id = z.uuid().parse((await params).id)
    const s = await session()
    requireAccess(s, "orders", "edit")
    return Response.json(await proposeChanges(s, id, proposal, revision))
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "changesNotSent") }, { status: failureStatus(error) })
  }
})
