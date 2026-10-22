import type { Permissions } from "@/lib/access"
import { canOpen, isAdmin } from "@/lib/access"
import type { OverviewSearch } from "@/lib/page-search"
import { requireAccess, requireBuyer } from "./authorization"
import { overview } from "./overview"
import { storeTimeZone } from "./store-time-zone"
import { supplierOverview } from "./supplier-overview"
import type { Session } from "./workspace-session"

// The page receives only its rendering data. In particular, a session's full organization, other workspaces and
// WorkOS identity never cross the rendering boundary. The caller resolves the session on the server for this request.
// `search` is the URL's period and channel.
export async function overviewPageData(
  s: Permissions & {
    org: Pick<Session["org"], "id" | "kind" | "timeZone" | "restockSalesDays" | "restockLeadTimeDays">
  },
  search: OverviewSearch
) {
  requireAccess(s, "overview")
  requireAccess(s, "prices")
  if (s.org.kind === "supplier") {
    return {
      kind: "supplier" as const,
      permissions: { role: s.role, access: s.access },
      data: await supplierOverview({ id: s.org.id, timeZone: s.org.timeZone }, search)
    }
  }
  requireBuyer(s)
  const data = await overview(
    {
      id: s.org.id,
      timeZone: await storeTimeZone(s.org),
      restockSalesDays: s.org.restockSalesDays,
      restockLeadTimeDays: s.org.restockLeadTimeDays
    },
    { channel: search.channel ?? null, period: search }
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
