import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { EmptyState, PageHeader } from "@/components/common"
import { Freshness, OverviewDashboard, OverviewSkeleton } from "@/components/overview"
import { ChannelFilter } from "@/components/overview-filter"
import { SetupChecklist } from "@/components/overview-sections"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { type Session, session } from "@/server/auth"
import { overview } from "@/server/overview"
import * as styles from "@/components/overview.css"

async function Dashboard({ org, channel }: { org: Session["org"]; channel: string | null }) {
  const data = await overview(org, { channel })
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
        <Freshness data={data} />
        {data.channels.length > 1 && <ChannelFilter channels={data.channels} value={data.channel?.key ?? ""} />}
      </div>
      <OverviewDashboard data={data} />
    </div>
  )
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
  const { channel } = await searchParams
  return (
    <>
      <PageHeader title="Overview" description="Sales, stock, purchasing and shipments at a glance.">
        <Button variant="outline" nativeButton={false} render={<Link href="/orders/new" />}>
          <ClipboardList data-icon="inline-start" />
          Create purchase order
        </Button>
        <Button nativeButton={false} render={<Link href="/restock" />}>
          Plan restock
        </Button>
      </PageHeader>
      <Suspense key={channel ?? ""} fallback={<OverviewSkeleton />}>
        <Dashboard org={s.org} channel={channel ?? null} />
      </Suspense>
    </>
  )
}
