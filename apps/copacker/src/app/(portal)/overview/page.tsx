import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { EmptyState, PageHeader } from "@/components/common"
import { OverviewDashboard, OverviewSkeleton } from "@/components/overview"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { session } from "@/server/auth"
import { overview } from "@/server/overview"

async function Dashboard({ orgId }: { orgId: string }) {
  const data = await overview(orgId)
  if (!data.connected.length) {
    return (
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
    )
  }
  return <OverviewDashboard data={data} />
}

export default async function OverviewPage() {
  const s = await session()
  if (s.org.kind !== "buyer") {
    redirect("/orders")
  }
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
      <Suspense fallback={<OverviewSkeleton />}>
        <Dashboard orgId={s.org.id} />
      </Suspense>
    </>
  )
}
