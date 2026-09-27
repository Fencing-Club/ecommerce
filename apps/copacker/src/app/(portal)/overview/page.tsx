import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { EmptyState, PageHeader } from "@/components/common"
import { OverviewDashboard, OverviewSkeleton } from "@/components/overview"
import { ChannelFilter } from "@/components/overview-filter"
import { SetupChecklist } from "@/components/overview-sections"
import { PeriodPicker } from "@/components/period-picker"
import { SupplierOverview } from "@/components/supplier/overview"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { type Session, session } from "@/server/auth"
import { overview } from "@/server/overview"
import { storeTimeZone } from "@/server/store-time-zone"
import { supplierOverview } from "@/server/supplier-workspace"
import * as styles from "@/components/overview.css"

export const metadata: Metadata = { title: "Overview" }

type Query = Record<string, string | string[] | undefined>

async function Dashboard({ org, query }: { org: Session["org"]; query: Query }) {
  const channel = typeof query.channel === "string" ? query.channel : null
  const data = await overview({ ...org, timeZone: await storeTimeZone(org) }, { channel, period: query })
  if (!data.connected.length) {
    return (
      <div className={styles.page}>
        <SetupChecklist steps={data.setup} />
        <Card>
          <CardContent>
            <EmptyState
              title="Connect your stores to see your overview"
              description="Connect Shopify and Amazon to bring sales, stock and restock together here."
            >
              <Button nativeButton={false} render={<Link href="/settings" />}>
                Connect your accounts
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      </div>
    )
  }
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <PeriodPicker period={data.period} />
          {data.channels.length > 1 && <ChannelFilter channels={data.channels} value={data.channel?.key ?? ""} />}
        </div>
      </div>
      <OverviewDashboard data={data} />
    </div>
  )
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Query> }) {
  const s = await session()
  if (s.org.kind === "supplier") {
    return (
      <>
        <PageHeader title="Overview" />
        <SupplierOverview data={await supplierOverview(s.org.id)} />
      </>
    )
  }
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  const query = await searchParams
  return (
    <>
      <PageHeader title="Overview" />
      <Suspense key={JSON.stringify(query)} fallback={<OverviewSkeleton />}>
        <Dashboard org={s.org} query={query} />
      </Suspense>
    </>
  )
}
