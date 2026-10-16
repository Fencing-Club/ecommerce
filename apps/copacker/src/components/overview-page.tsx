"use client"

import { useTranslations } from "use-intl"
import type { OverviewPageData } from "@/server/overview-page"
import { EmptyState, PageHeader } from "./common"
import { OverviewDashboard, OverviewFilters, OverviewFiltersSkeleton, OverviewSkeleton } from "./overview"
import { SetupChecklist } from "./overview-sections"
import { PeriodPicker, type PeriodSelection } from "./period-picker"
import { SupplierOverview } from "./supplier/overview"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"

// Ordinary synchronous components, shared by the route and stories. All reads and permission filtering finish on the
// server before this data reaches the browser; neither Suspense nor a client component is an authorization boundary.
export function OverviewPageView({
  page,
  refresh,
  onPeriodChange,
  onChannelChange
}: {
  page: OverviewPageData
  refresh: () => void
  onPeriodChange: (period: PeriodSelection) => void
  onChannelChange: (channel: string | null) => void
}) {
  const t = useTranslations("overview")
  if (page.kind === "supplier") {
    return (
      <>
        <PageHeader title={t("title")}>
          <PeriodPicker period={page.data.period} onChange={onPeriodChange} />
        </PageHeader>
        <SupplierOverview data={page.data} permissions={page.permissions} />
      </>
    )
  }
  const { data, admin } = page
  return (
    <>
      <PageHeader title={t("title")}>
        <OverviewFilters data={data} onPeriodChange={onPeriodChange} onChannelChange={onChannelChange} />
      </PageHeader>
      {data.connected.length ? (
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
      )}
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
