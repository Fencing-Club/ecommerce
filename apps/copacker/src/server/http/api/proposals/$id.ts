import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { failureMessage, failureStatus } from "@/server/errors"
import { approveProposal, declineProposal, withdrawProposal } from "@/server/order-proposals"

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("decline"), reason: z.string().max(2000).default("") }),
  z.object({ action: z.literal("withdraw") })
])

// The buyer approves or declines a supplier's changes to a PO, or the supplier withdraws them.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = input.parse(await request.json())
    const id = z.uuid().parse(params.id)
    const s = await session()
    requireAccess(s, "orders", "edit")
    if (body.action === "approve") {
      await approveProposal(s, id)
    } else if (body.action === "decline") {
      await declineProposal(s, id, body.reason)
    } else {
      await withdrawProposal(s, id)
    }
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "couldNotSave") }, { status: failureStatus(error) })
  }
}
