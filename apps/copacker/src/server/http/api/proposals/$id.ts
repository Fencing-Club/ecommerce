import { match } from "ts-pattern"
import { z } from "zod"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { requestInput, requestJson } from "@/server/errors"
import { approveProposal, declineProposal, withdrawProposal } from "@/server/order-proposals"

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("decline"), reason: z.string().max(2000).default("") }),
  z.object({ action: z.literal("withdraw") })
])

// The buyer approves or declines a supplier's changes to a PO, or the supplier withdraws them. Approving them sets the
// PO's prices, which Purchase orders: Edit includes.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = requestInput(input, await requestJson(request))
  const id = requestInput(z.uuid(), params.id)
  const s = await session()
  requireAccess(s, "orders", "edit")
  await match(body)
    .with({ action: "approve" }, () => approveProposal(s, id))
    .with({ action: "decline" }, ({ reason }) => declineProposal(s, id, reason))
    .with({ action: "withdraw" }, () => withdrawProposal(s, id))
    .exhaustive()
  return Response.json({ ok: true })
}
