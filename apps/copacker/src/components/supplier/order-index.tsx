"use client"

import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useState } from "react"
import { PageLink, useCan } from "@/components/access"
import { EmptyState, Status } from "@/components/common"
import { LinkRow } from "@/components/link-row"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMoney } from "@/hooks/use-money"
import { formatDate } from "@/lib/format"
import type { ListedOrder, OrderStage } from "@/server/supplier-workspace"
import { IndexToolbar, matches, Pager } from "./shared"

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
  const [page, setPage] = useState(0)
  const t = useTranslations("supplier.orderIndex")
  const shared = useTranslations("supplier.shared")
  const locale = useLocale()
  const money = useMoney()
  const test = tabs.find((option) => option.value === tab)!.test
  const shown = orders.filter(
    (order) => test(order.stage) && matches(query, order.reference, order.customer, order.firstItem)
  )
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, pages - 1)

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
          setPage(0)
        }}
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          setPage(0)
        }}
        placeholder={t("search")}
      />
      {shown.length ? (
        <Table>
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
            {shown.slice(current * pageSize, (current + 1) * pageSize).map((order) => (
              <LinkRow key={order.id} href={`/orders/${order.id}`}>
                <TableCell className="max-w-72">
                  <Link href={`/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">
                    {order.reference}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.lines === 1
                      ? order.firstItem
                      : t("firstAndMore", { first: order.firstItem, count: order.lines - 1 })}
                  </p>
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums @2xl:table-cell">
                  {formatDate(order.sentAt, locale)}
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
        </Table>
      ) : (
        <EmptyState title={t("noneHere")} description={t("noneHereDescription")} />
      )}
      <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
    </div>
  )
}
