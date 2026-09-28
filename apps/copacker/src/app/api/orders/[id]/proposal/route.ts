import { z } from "zod"
import { requireAccess, session } from "@/server/auth"
import { failureStatus } from "@/server/errors"
import { proposeChanges } from "@/server/order-proposals"
import { isAppOrigin } from "@/server/security"

const input = z.object({ revision: z.number().int().positive(), proposal: z.unknown() })

// The supplier sends its changes to a PO for the buyer to approve.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const { revision, proposal } = input.parse(await request.json())
    const id = z.uuid().parse((await params).id)
    const s = await session()
    requireAccess(s, "orders", "edit")
    return Response.json(await proposeChanges(s, id, proposal, revision))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Couldn't send the changes" },
      { status: failureStatus(error) }
    )
  }
}
