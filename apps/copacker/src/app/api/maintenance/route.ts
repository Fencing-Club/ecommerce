import { underMaintenance } from "@/server/maintenance"
import { withRequest } from "@/server/next-request"

// Whether Copacker is down for maintenance, which the maintenance page asks until it can reload.
export const dynamic = "force-dynamic"

export const GET = withRequest(async function GET() {
  return Response.json({ active: await underMaintenance() }, { headers: { "Cache-Control": "no-store" } })
})
