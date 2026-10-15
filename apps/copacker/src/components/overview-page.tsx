"use client"

import Link from "next/link"
import { useTranslations } from "use-intl"
import type { OverviewPageData } from "@/server/overview-page"
import { EmptyState, PageHeader } from "./common"
import { OverviewDashboard, OverviewFilters, OverviewFiltersSkeleton, OverviewSkeleton } from "./overview"
import { SetupChecklist } from "./overview-sections"
import { PeriodPicker } from "./period-picker"
import { SupplierOverview } from "./supplier/overview"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"

// Ordinary synchronous components, shared by the route and stories. All reads and permission filtering finish on the
// server before this data reaches the browser; neither Suspense nor a client component is an authorization boundary.
export function OverviewPageView({ page }: { page: OverviewPageData }) {
  const t = useTranslations("overview")
  if (page.kind === "supplier") {
    return (
      <>
        <PageHeader title={t("title")}>
          <PeriodPicker period={page.data.period} />
        </PageHeader>
        <SupplierOverview data={page.data} permissions={page.permissions} />
      </>
    )
  }
  const { data, admin } = page
  return (
    <>
      <PageHeader title={t("title")}>
        <OverviewFilters data={data} />
      </PageHeader>
      {data.connected.length ? (
        <OverviewDashboard data={data} />
      ) : (
        <div className="flex flex-col gap-6">
          {admin && <SetupChecklist steps={data.setup} />}
          <Card>
            <CardContent>
              <EmptyState
                title={t("noStores.title")}
                description={admin ? t("noStores.connectDescription") : t("noStores.askAdmin")}
              >
                {admin && (
                  <Button nativeButton={false} render={<Link href="/settings#integrations" />}>
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
