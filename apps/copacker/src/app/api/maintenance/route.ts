import { underMaintenance } from "@/server/maintenance"

// Whether Copacker is down for maintenance, which the maintenance page asks until it can reload.
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({ active: await underMaintenance() }, { headers: { "Cache-Control": "no-store" } })
}
