"use client"

import { money } from "@repo/aisle"
import Link from "next/link"
import { useState } from "react"
import { PageLink } from "@/components/access"
import { EmptyState, Status } from "@/components/common"
import { LinkRow } from "@/components/link-row"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import type { OrderStage, SupplierOrder } from "@/server/supplier-workspace"
import { IndexToolbar, matches, Pager } from "./shared"

type Tab = "all" | OrderStage
const tabs: Array<{ value: Tab; label: string; test: (stage: OrderStage) => boolean }> = [
  { value: "all", label: "All", test: () => true },
  { value: "pack", label: "To pack", test: (stage) => stage === "pack" },
  { value: "waiting", label: "Waiting", test: (stage) => stage === "waiting" },
  { value: "ship", label: "To ship", test: (stage) => stage === "ship" },
  { value: "shipped", label: "Shipped", test: (stage) => stage === "shipped" },
  { value: "closed", label: "Closed", test: (stage) => stage === "closed" }
]
const pageSize = 50

// The orders a supplier's customers sent, like Shopify's order list: tabs by what's next, search, and a row each that
// opens the order from anywhere on it.
export function SupplierOrderIndex({
  orders,
  initialTab = "all",
  showCustomer = true
}: {
  orders: SupplierOrder[]
  initialTab?: string
  showCustomer?: boolean
}) {
  const [tab, setTab] = useState<Tab>(tabs.find((option) => option.value === initialTab)?.value ?? "all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const test = tabs.find((option) => option.value === tab)!.test
  const shown = orders.filter(
    (order) => test(order.stage) && matches(query, order.reference, order.customer, order.firstItem)
  )
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, pages - 1)

  if (!orders.length) {
    return <EmptyState title="No orders yet" description="Purchase orders your customers send appear here" />
  }

  return (
    <div className="@container flex flex-col gap-3">
      <IndexToolbar
        tabs={tabs.map((option) => ({
          value: option.value,
          label: option.label,
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
        placeholder="Search orders"
      />
      {shown.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead className="hidden @2xl:table-cell">Date</TableHead>
              {showCustomer && <TableHead>Customer</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right @3xl:table-cell">Pieces</TableHead>
              <TableHead className="text-right">Total</TableHead>
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
                    {order.lines === 1 ? order.firstItem : `${order.firstItem} and ${order.lines - 1} more`}
                  </p>
                </TableCell>
                <TableCell className="hidden text-muted-foreground @2xl:table-cell">
                  {formatDate(order.sentAt)}
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
                <TableCell className="hidden text-right tabular-nums @3xl:table-cell">
                  {order.pieces.toLocaleString("en-US")}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(order.total, order.currency)}</TableCell>
              </LinkRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="No orders here" description="Try another tab or search" />
      )}
      <Pager page={current} pages={pages} total={shown.length} size={pageSize} onPage={setPage} />
    </div>
  )
}
