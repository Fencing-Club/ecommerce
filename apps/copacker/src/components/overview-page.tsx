import { Button, Card, CardContent, Spinner } from "@buildkitgg/shadcn"
import { useTranslations } from "use-intl"
import { readPeriod } from "@/lib/date-range"
import type { OverviewSearch } from "@/lib/page-search"
import type { OverviewPageData } from "@/server/overview-page"
import { EmptyState, PageHeader } from "./common"
import { OverviewDashboard, OverviewFilters, OverviewFiltersSkeleton, OverviewSkeleton } from "./overview"
import { SetupChecklist } from "./overview-sections"
import type { PeriodSelection } from "./period-picker"
import { PeriodPicker } from "./period-picker"
import { SupplierOverview } from "./supplier/overview"

// Ordinary synchronous components, shared by the route and stories. All reads and permission filtering finish on the
// server before this data reaches the browser; neither Suspense nor a client component is an authorization boundary.
export function OverviewPageView({
  page,
  refresh,
  pendingSearch,
  onPeriodChange,
  onChannelChange
}: {
  pendingSearch?: OverviewSearch
  page: OverviewPageData
  refresh: () => void
  onPeriodChange: (period: PeriodSelection) => void
  onChannelChange: (channel: string | null) => void
}) {
  const t = useTranslations("overview")
  const period = pendingSearch
    ? { ...page.data.period, ...readPeriod(pendingSearch, page.data.period.today) }
    : page.data.period
  const pendingContent = pendingSearch ? (
    <>
      <output className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        {t("updating")}
      </output>
      <OverviewSkeleton />
    </>
  ) : null
  if (page.kind === "supplier") {
    return (
      <>
        <PageHeader title={t("title")}>
          <PeriodPicker period={period} onChange={onPeriodChange} />
        </PageHeader>
        {pendingContent ?? <SupplierOverview data={page.data} permissions={page.permissions} />}
      </>
    )
  }
  const { data, admin } = page
  return (
    <>
      <PageHeader title={t("title")}>
        <OverviewFilters
          data={data}
          period={period}
          channel={pendingSearch ? (pendingSearch.channel ?? null) : (data.channel?.key ?? null)}
          onPeriodChange={onPeriodChange}
          onChannelChange={onChannelChange}
        />
      </PageHeader>
      {pendingContent ??
        (data.connected.length ? (
          <OverviewDashboard data={data} refresh={refresh} />
        ) : (
          <div className="flex flex-col gap-6">
            {admin && <SetupChecklist steps={data.setup} refresh={refresh} />}
            <Card>
              <CardContent>
                <EmptyState
                  title={t("noStores.title")}
                  description={admin ? t("noStores.connectDescription") : t("noStores.askAdmin")}
                >
                  {admin && (
                    <Button
                      nativeButton={false}
                      render={<a href="/settings#integrations" aria-label={t("noStores.connect")} />}
                    >
                      {t("noStores.connect")}
                    </Button>
                  )}
                </EmptyState>
              </CardContent>
            </Card>
          </div>
        ))}
    </>
  )
}

export function OverviewPagePending() {
  const t = useTranslations("overview")
  return (
    <>
      <PageHeader title={t("title")}>
        <OverviewFiltersSkeleton />
      </PageHeader>
      <OverviewSkeleton />
    </>
  )
}
