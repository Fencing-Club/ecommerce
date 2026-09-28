import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { EmptyState, PageHeader } from "@/components/common"
import { OverviewDashboard, OverviewFilters, OverviewFiltersSkeleton, OverviewSkeleton } from "@/components/overview"
import { SetupChecklist } from "@/components/overview-sections"
import { PeriodPicker } from "@/components/period-picker"
import { SupplierOverview } from "@/components/supplier/overview"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { type Session, session } from "@/server/auth"
import { type Overview, overview } from "@/server/overview"
import { storeTimeZone } from "@/server/store-time-zone"
import { supplierOverview } from "@/server/supplier-overview"

export const metadata: Metadata = { title: "Overview" }

type Query = Record<string, string | string[] | undefined>

async function load(org: Session["org"], query: Query) {
  const channel = typeof query.channel === "string" ? query.channel : null
  return overview({ ...org, timeZone: await storeTimeZone(org) }, { channel, period: query })
}

async function Dashboard({ data: pending }: { data: Promise<Overview> }) {
  const data = await pending
  if (!data.connected.length) {
    return (
      <div className="flex flex-col gap-6">
        <SetupChecklist steps={data.setup} />
        <Card>
          <CardContent>
            <EmptyState title="No stores connected" description="Connect Shopify or Amazon to see your overview">
              <Button nativeButton={false} render={<Link href="/settings#integrations" />}>
                Connect stores
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      </div>
    )
  }
  return <OverviewDashboard data={data} />
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Query> }) {
  const s = await session()
  if (s.org.kind === "supplier") {
    const data = await supplierOverview(s.org, await searchParams)
    return (
      <>
        <PageHeader title="Overview">
          <PeriodPicker period={data.period} />
        </PageHeader>
        <SupplierOverview data={data} />
      </>
    )
  }
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  const query = await searchParams
  // Loaded once, for the filters beside the title and the cards below.
  const data = load(s.org, query)
  const key = JSON.stringify(query)
  return (
    <>
      <PageHeader title="Overview">
        <Suspense key={key} fallback={<OverviewFiltersSkeleton />}>
          <OverviewFilters data={data} />
        </Suspense>
      </PageHeader>
      <Suspense key={key} fallback={<OverviewSkeleton />}>
        <Dashboard data={data} />
      </Suspense>
    </>
  )
}
