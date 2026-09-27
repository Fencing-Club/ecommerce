import { z } from "zod"
import { session } from "@/server/auth"
import { proposeChanges } from "@/server/order-proposals"
import { appUrl } from "@/server/security"

const input = z.object({ revision: z.number().int().positive(), proposal: z.unknown() })

// The supplier sends its changes to a PO for the buyer to approve.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const { revision, proposal } = input.parse(await request.json())
    const id = z.uuid().parse((await params).id)
    return Response.json(await proposeChanges(await session(), id, proposal, revision))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Couldn't send the changes" },
      { status: 400 }
    )
  }
}
