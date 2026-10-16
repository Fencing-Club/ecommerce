"use client"

import { useRouter } from "next/navigation"
import { OverviewPageView } from "@/components/overview-page"
import { overviewHref, selectOverviewChannel, selectOverviewPeriod, type OverviewSearch } from "@/lib/overview-search"
import type { OverviewPageData } from "@/server/overview-page"

export function OverviewContent({ page, query }: { page: OverviewPageData; query: OverviewSearch }) {
  const router = useRouter()
  return (
    <OverviewPageView
      page={page}
      refresh={router.refresh}
      onPeriodChange={(period) => router.push(overviewHref(selectOverviewPeriod(query, period)))}
      onChannelChange={(channel) => router.push(overviewHref(selectOverviewChannel(query, channel)))}
    />
  )
}
