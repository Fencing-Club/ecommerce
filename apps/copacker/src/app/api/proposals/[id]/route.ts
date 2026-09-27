import { z } from "zod"
import { session } from "@/server/auth"
import { approveProposal, declineProposal, withdrawProposal } from "@/server/order-proposals"
import { appUrl } from "@/server/security"

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("decline"), reason: z.string().max(2000).default("") }),
  z.object({ action: z.literal("withdraw") })
])

// The buyer approves or declines a supplier's changes to a PO, or the supplier withdraws them.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const body = input.parse(await request.json())
    const id = z.uuid().parse((await params).id)
    const s = await session()
    if (body.action === "approve") {
      await approveProposal(s, id)
    } else if (body.action === "decline") {
      await declineProposal(s, id, body.reason)
    } else {
      await withdrawProposal(s, id)
    }
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't save" }, { status: 400 })
  }
}
