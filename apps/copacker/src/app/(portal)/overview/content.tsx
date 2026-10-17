import { useRouter } from "@tanstack/react-router"
import { OverviewPageView } from "@/components/overview-page"
import type { OverviewSearch } from "@/lib/overview-search"
import { overviewHref, selectOverviewChannel, selectOverviewPeriod } from "@/lib/overview-search"
import type { OverviewPageData } from "@/server/overview-page"

export function OverviewContent({ page, query }: { page: OverviewPageData; query: OverviewSearch }) {
  const router = useRouter()
  return (
    <OverviewPageView
      page={page}
      refresh={router.invalidate}
      onPeriodChange={(period) => router.navigate({ href: overviewHref(selectOverviewPeriod(query, period)) })}
      onChannelChange={(channel) => router.navigate({ href: overviewHref(selectOverviewChannel(query, channel)) })}
    />
  )
}
