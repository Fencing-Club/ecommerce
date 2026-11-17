import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@buildkitgg/shadcn"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { useLocale, useTimeZone, useTranslations } from "use-intl"
import { PageLink, useCan } from "@/components/access"
import { EmptyState, Status } from "@/components/common"
import { FramedTable } from "@/components/framed-table"
import { LinkRow } from "@/components/link-row"
import { IndexToolbar } from "@/components/list/index-toolbar"
import { matches } from "@/components/list/matches"
import { Pager } from "@/components/list/pager"
import { usePagedRows } from "@/components/list/use-paged-rows"
import { useMoney } from "@/hooks/use-money"
import { formatDate } from "@/lib/format"
import type { ListedOrder } from "@/server/supplier-workspace"
import type { OrderStage } from "@/server/supplier-workspace"

type Tab = "all" | OrderStage
const tabs: Array<{ value: Tab; test: (stage: OrderStage) => boolean }> = [
  { value: "all", test: () => true },
  { value: "pack", test: (stage) => stage === "pack" },
  { value: "waiting", test: (stage) => stage === "waiting" },
  { value: "ship", test: (stage) => stage === "ship" },
  { value: "shipped", test: (stage) => stage === "shipped" },
  { value: "closed", test: (stage) => stage === "closed" }
]
const pageSize = 50

// The orders a supplier's customers sent, like Shopify's order list: tabs by what's next, search, and a row each that
// opens the order from anywhere on it.
export function SupplierOrderIndex({
  orders,
  initialTab = "all",
  showCustomer = true
}: {
  // Without totals for someone who doesn't see prices.
  orders: ListedOrder[]
  initialTab?: string
  showCustomer?: boolean
}) {
  const prices = useCan("prices")
  const [tab, setTab] = useState<Tab>(tabs.find((option) => option.value === initialTab)?.value ?? "all")
  const [query, setQuery] = useState("")
  const t = useTranslations("supplier.orderIndex")
  const shared = useTranslations("supplier.shared")
  const locale = useLocale()
  const timeZone = useTimeZone()
  const money = useMoney()
  const test = tabs.find((option) => option.value === tab)!.test
  const shown = orders.filter(
    (order) => test(order.stage) && matches(query, order.reference, order.customer, order.firstItem)
  )
  const paged = usePagedRows(shown, pageSize)

  if (!orders.length) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
  }

  return (
    <div className="@container flex flex-col gap-3">
      <IndexToolbar
        tabs={tabs.map((option) => ({
          value: option.value,
          label: option.value === "all" ? shared("all") : t(`tabs.${option.value}`),
          count: orders.filter((order) => option.test(order.stage)).length
        }))}
        tab={tab}
        onTabChange={(value) => {
          setTab(value)
          paged.reset()
        }}
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          paged.reset()
        }}
        placeholder={t("search")}
      />
      {shown.length ? (
        <FramedTable>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.order")}</TableHead>
              <TableHead className="hidden @2xl:table-cell">{t("columns.date")}</TableHead>
              {showCustomer && <TableHead>{t("columns.customer")}</TableHead>}
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="hidden text-end @3xl:table-cell">{t("columns.pieces")}</TableHead>
              {prices && <TableHead className="text-end">{t("columns.total")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.map((order) => (
              <LinkRow key={order.id} href={`/orders/${order.id}`}>
                <TableCell className="max-w-72">
                  <Link
                    to="/orders/$id"
                    params={{ id: order.id }}
                    className="focus-ring rounded-sm font-medium underline-offset-4 hover:underline"
                  >
                    {order.reference}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.lines === 1
                      ? order.firstItem
                      : t("firstAndMore", { first: order.firstItem, count: order.lines - 1 })}
                  </p>
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums @2xl:table-cell">
                  {formatDate(order.sentAt, locale, timeZone)}
                </TableCell>
                {showCustomer && (
                  <TableCell>
                    <PageLink href={`/customers/${order.customerId}`} className="hover:underline">
                      {order.customer}
                    </PageLink>
                  </TableCell>
                )}
                <TableCell>
                  <Status status={order.status} />
                </TableCell>
                <TableCell className="hidden text-end tabular-nums @3xl:table-cell">
                  {order.pieces.toLocaleString(locale)}
                </TableCell>
                {prices && (
                  <TableCell className="text-end tabular-nums">
                    {order.total === null ? null : money(order.total, order.currency)}
                  </TableCell>
                )}
              </LinkRow>
            ))}
          </TableBody>
        </FramedTable>
      ) : (
        <EmptyState title={t("noneHere")} description={t("noneHereDescription")} />
      )}
      <Pager {...paged.pager} />
    </div>
  )
}
