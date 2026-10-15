import { canOpen, isAdmin, type Permissions } from "@/lib/access"
import { type Session, requireAccess, requireBuyer } from "./auth"
import { overview } from "./overview"
import { storeTimeZone } from "./store-time-zone"
import { supplierOverview } from "./supplier-overview"

type Query = Record<string, string | string[] | undefined>

// The page receives only its rendering data. In particular, a session's full organization, other workspaces and
// WorkOS identity never cross the rendering boundary. The caller resolves the session on the server for this request.
export async function overviewPageData(
  s: Permissions & {
    org: Pick<Session["org"], "id" | "kind" | "timeZone" | "restockSalesDays" | "restockLeadTimeDays">
  },
  query: Query
) {
  requireAccess(s, "overview")
  requireAccess(s, "prices")
  if (s.org.kind === "supplier") {
    return {
      kind: "supplier" as const,
      permissions: { role: s.role, access: s.access },
      data: await supplierOverview({ id: s.org.id, timeZone: s.org.timeZone }, query)
    }
  }
  requireBuyer(s)
  const channel = typeof query.channel === "string" ? query.channel : null
  const data = await overview(
    {
      id: s.org.id,
      timeZone: await storeTimeZone(s.org),
      restockSalesDays: s.org.restockSalesDays,
      restockLeadTimeDays: s.org.restockLeadTimeDays
    },
    { channel, period: query }
  )
  return {
    kind: "buyer" as const,
    admin: isAdmin(s),
    data: {
      ...data,
      attention: data.attention.filter((item) => canOpen(s, item.href)),
      setup: isAdmin(s) ? data.setup : []
    }
  }
}

export type OverviewPageData = Awaited<ReturnType<typeof overviewPageData>>
