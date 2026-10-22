import { useRouter } from "@tanstack/react-router"
import { OverviewPageView } from "@/components/overview-page"
import { periodSearch } from "@/lib/date-range"
import type { OverviewSearch } from "@/lib/page-search"
import type { OverviewPageData } from "@/server/overview-page"

// A new period keeps the channel, and a new channel keeps the period.
export function OverviewContent({ page, search }: { page: OverviewPageData; search: OverviewSearch }) {
  const router = useRouter()
  return (
    <OverviewPageView
      page={page}
      refresh={router.invalidate}
      onPeriodChange={(period) =>
        router.navigate({ to: "/overview", search: { channel: search.channel, ...periodSearch(period) } })
      }
      onChannelChange={(channel) =>
        router.navigate({ to: "/overview", search: { ...search, channel: channel ?? undefined } })
      }
    />
  )
}
