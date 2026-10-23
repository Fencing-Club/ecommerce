import { useRouter, useRouterState } from "@tanstack/react-router"
import { OverviewPageView } from "@/components/overview-page"
import { periodSearch } from "@/lib/date-range"
import { overviewSearch, type OverviewSearch } from "@/lib/page-search"
import type { OverviewPageData } from "@/server/overview-page"

// A new period keeps the channel, and a new channel keeps the period.
export function OverviewContent({ page, search }: { page: OverviewPageData; search: OverviewSearch }) {
  const router = useRouter()
  const pending = useRouterState({
    select: (state) =>
      state.status === "pending" && state.location.pathname === "/overview" ? state.location.search : null
  })
  // The requested URL changes before the loader commits. Compose rapid changes from it, not the old page.
  const selection = pending ? overviewSearch.parse(pending) : search
  return (
    <OverviewPageView
      page={page}
      pendingSearch={pending ? selection : undefined}
      refresh={router.invalidate}
      onPeriodChange={(period) =>
        router.navigate({ to: "/overview", search: { channel: selection.channel, ...periodSearch(period) } })
      }
      onChannelChange={(channel) =>
        router.navigate({ to: "/overview", search: { ...selection, channel: channel ?? undefined } })
      }
    />
  )
}
