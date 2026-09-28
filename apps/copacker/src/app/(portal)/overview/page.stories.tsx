import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { Suspense } from "react"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { EmptyState, PageHeader } from "@/components/common"
import { OverviewDashboard, OverviewFilters, OverviewFiltersSkeleton, OverviewSkeleton } from "@/components/overview"
import { SetupChecklist } from "@/components/overview-sections"
import { PeriodPicker } from "@/components/period-picker"
import { SupplierOverview } from "@/components/supplier/overview"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { canOpen, isAdmin, type Permissions } from "@/lib/access"
import type { Overview } from "@/server/overview"
import type { SupplierOverviewData } from "@/server/supplier-overview"
import { buyerOverview, supplierOverviewData, unconnectedOverview } from "@/stories/fixtures/overview"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"

type Args = { permissions: Permissions; data: Overview; supplier: SupplierOverviewData }

// The page's Dashboard: the overview's cards, or connecting a store when there's none.
async function Dashboard({ data: pending, admin }: { data: Promise<Overview>; admin: boolean }) {
  const [data, t] = await Promise.all([pending, getTranslations("overview.noStores")])
  if (!data.connected.length) {
    return (
      <div className="flex flex-col gap-6">
        {admin && <SetupChecklist steps={data.setup} />}
        <Card>
          <CardContent>
            <EmptyState title={t("title")} description={admin ? t("connectDescription") : t("askAdmin")}>
              {admin && (
                <Button nativeButton={false} render={<Link href="/settings#integrations" />}>
                  {t("connect")}
                </Button>
              )}
            </EmptyState>
          </CardContent>
        </Card>
      </div>
    )
  }
  return <OverviewDashboard data={data} />
}

// A buyer's Overview (page.tsx): what needs attention on the pages the person can open, and setting up the workspace
// for its owner and admins.
async function BuyerOverviewPage({ permissions, data }: Args) {
  const t = await getTranslations("overview")
  const shown = Promise.resolve({
    ...data,
    attention: data.attention.filter((item) => canOpen(permissions, item.href)),
    setup: isAdmin(permissions) ? data.setup : []
  })
  return (
    <>
      <PageHeader title={t("title")}>
        <Suspense fallback={<OverviewFiltersSkeleton />}>
          <OverviewFilters data={shown} />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<OverviewSkeleton />}>
        <Dashboard data={shown} admin={isAdmin(permissions)} />
      </Suspense>
    </>
  )
}

// What the buyer's Overview shows while its data loads: the Suspense fallbacks.
async function LoadingOverviewPage() {
  const t = await getTranslations("overview")
  return (
    <>
      <PageHeader title={t("title")}>
        <OverviewFiltersSkeleton />
      </PageHeader>
      <OverviewSkeleton />
    </>
  )
}

// A supplier's Overview (page.tsx): orders, stock and what needs doing, for the chosen period.
async function SupplierOverviewPage({ permissions, supplier }: Args) {
  const t = await getTranslations("overview")
  return (
    <>
      <PageHeader title={t("title")}>
        <PeriodPicker period={supplier.period} />
      </PageHeader>
      <SupplierOverview data={supplier} permissions={permissions} />
    </>
  )
}

// A member with the Overview (which needs prices) and purchase orders, but not Restock or Shipments.
const reader: Permissions = { role: "member", access: { overview: "view", prices: "view", orders: "view" } }
const buyer = pageStory("/overview", BuyerOverviewPage, "buyer")

const meta = preview.meta({
  title: "Pages/Overview",
  // Each story renders its workspace's page, whose loaders and portal come with it.
  render: buyer.render,
  args: { permissions: owner, data: buyerOverview, supplier: supplierOverviewData }
})

export const Buyer = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Last 30 days/ })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Channel" })).toHaveTextContent("All channels")
    await expect(page.getByRole("region", { name: "Sales, Last 30 days" })).toBeVisible()
    await expect(page.getByRole("link", { name: /2 items will run out/ })).toBeVisible()
  }
})

// A member sees only what needs attention on pages they can open, and no setup.
export const BuyerForMember = meta.story({
  ...buyer,
  args: { permissions: reader, data: { ...buyerOverview, setup: unconnectedOverview.setup } },
  parameters: { ...buyer.parameters, permissions: reader },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.queryByText("2 items will run out")).toBeNull()
    await expect(page.queryByText("1 shipment needs approval")).toBeNull()
    await expect(page.getByRole("link", { name: /1 draft purchase order/ })).toBeVisible()
    await expect(page.queryByText("Finish setting up")).toBeNull()
  }
})

export const SetupChecklistShown = meta.story({
  ...buyer,
  args: {
    data: { ...buyerOverview, setup: unconnectedOverview.setup.map((step, index) => ({ ...step, done: index < 2 })) }
  },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByText("Finish setting up")).toBeVisible()
    await expect(page.getByText("2 of 4 done")).toBeVisible()
  }
})

export const NoStores = meta.story({
  ...buyer,
  args: { data: unconnectedOverview },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByText("No stores connected")).toBeVisible()
    await expect(page.getByText("Connect Shopify or Amazon to see your overview")).toBeVisible()
    await expect(page.getByRole("button", { name: "Connect stores" })).toHaveAttribute("href", "/settings#integrations")
    await expect(page.getByText("0 of 4 done")).toBeVisible()
    // Nothing to filter without a store.
    await expect(page.queryByRole("combobox", { name: "Channel" })).toBeNull()
  }
})

export const NoStoresForMember = meta.story({
  ...buyer,
  args: { permissions: reader, data: unconnectedOverview },
  parameters: { ...buyer.parameters, permissions: reader },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByText("Ask an admin to connect them")).toBeVisible()
    await expect(page.queryByRole("button", { name: "Connect stores" })).toBeNull()
    await expect(page.queryByText("Finish setting up")).toBeNull()
  }
})

export const Loading = meta.story({
  ...pageStory("/overview", LoadingOverviewPage, "buyer"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Loading overview")).toHaveAttribute("aria-busy", "true")
  }
})

export const Supplier = meta.story({
  ...pageStory("/overview", SupplierOverviewPage, "supplier"),
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Last 30 days/ })).toBeVisible()
    await expect(page.getAllByText("Orders received")[0]).toBeVisible()
    await expect(page.getAllByText("Harbor Goods")[0]).toBeVisible()
    await expect(page.getByText("2 orders to pack")).toBeVisible()
  }
})
