"use client"

import { useLocale, useTimeZone, useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useCan } from "@/components/access"
import { EmptyState } from "@/components/common"
import { LinkRow } from "@/components/link-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { Amounts, IndexToolbar, matches } from "./shared"

type CatalogOption = { id: string; title: string; status: "active" | "draft" | "archived" }
const none = "none"

// Which catalog a customer sees, saved as soon as it's picked. "No catalog", as the list's tab calls it, offers every
// active product at its own price (the noCatalogHint message); `hint` says so under the select.
export function CatalogPicker({
  customerId,
  customer,
  catalogs,
  value,
  hint = false,
  className
}: {
  customerId: string
  customer: string
  catalogs: CatalogOption[]
  value: string | null
  hint?: boolean
  className?: string
}) {
  const router = useRouter()
  const t = useTranslations("supplier.customers")
  const shared = useTranslations("supplier.shared")
  const [current, setCurrent] = useState(value ?? none)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  // Someone who can only view customers sees each one's catalog without changing it.
  const editable = useCan("customers", "edit")
  const options = [
    { value: none, label: t("noCatalog") },
    ...catalogs.map((catalog) => ({
      value: catalog.id,
      label:
        catalog.status === "active"
          ? catalog.title
          : t("catalogWithStatus", { title: catalog.title, status: catalog.status })
    }))
  ]

  async function choose(next: string) {
    const previous = current
    setCurrent(next)
    setPending(true)
    setError("")
    try {
      const response = await fetch(`/api/customers/${customerId}/catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId: next === none ? null : next })
      })
      if (!response.ok) {
        throw new Error((await response.json()).error ?? shared("couldNotSave"))
      }
      router.refresh()
    } catch (caught) {
      setCurrent(previous)
      setError(caught instanceof Error ? caught.message : shared("couldNotSave"))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={className}>
      <Select
        items={options}
        value={current}
        onValueChange={(next) => next && void choose(next)}
        disabled={pending || !editable}
      >
        <SelectTrigger aria-label={t("catalogFor", { customer })} className="w-full min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.value === none ? (
                <span className="flex flex-col">
                  {option.label}
                  <span className="text-xs text-muted-foreground">{t("noCatalogHint")}</span>
                </span>
              ) : (
                option.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && current === none && !error && <p className="mt-2 text-xs text-muted-foreground">{t("noCatalogHint")}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

type Customer = {
  id: string
  name: string
  catalogId: string | null
  orders: number
  open: number
  spent: Array<{ currency: string; amount: number }>
  lastOrderAt: Date | null
  createdAt: Date
}

export function CustomerIndex({ customers, catalogs }: { customers: Customer[]; catalogs: CatalogOption[] }) {
  // What each customer spent is left out for someone who doesn't see prices, whose rows come without it.
  const prices = useCan("prices")
  const [tab, setTab] = useState<"all" | "open" | "none">("all")
  const [query, setQuery] = useState("")
  const t = useTranslations("supplier.customers")
  const shared = useTranslations("supplier.shared")
  const locale = useLocale()
  const timeZone = useTimeZone()
  if (!customers.length) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
  }
  const tests = {
    all: () => true,
    open: (customer: Customer) => customer.open > 0,
    none: (customer: Customer) => !customer.catalogId
  }
  const shown = customers.filter((customer) => tests[tab](customer) && matches(query, customer.name))
  return (
    <div className="@container flex flex-col gap-3">
      <IndexToolbar
        tabs={[
          { value: "all", label: shared("all"), count: customers.length },
          { value: "open", label: t("withOpenOrders"), count: customers.filter(tests.open).length },
          { value: "none", label: t("noCatalog"), count: customers.filter(tests.none).length }
        ]}
        tab={tab}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        placeholder={t("search")}
      />
      {shown.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.customer")}</TableHead>
              <TableHead>{t("columns.catalog")}</TableHead>
              <TableHead className="hidden text-end @2xl:table-cell">{t("columns.orders")}</TableHead>
              <TableHead className="hidden @3xl:table-cell">{t("columns.lastOrder")}</TableHead>
              {prices && <TableHead className="text-end">{t("columns.spent")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((customer) => (
              <LinkRow key={customer.id} href={`/customers/${customer.id}`}>
                <TableCell>
                  <Link href={`/customers/${customer.id}`} className="font-medium underline-offset-4 hover:underline">
                    {customer.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {customer.open
                      ? t("openCount", { count: customer.open })
                      : t("since", { date: formatDate(customer.createdAt, locale, timeZone) })}
                  </p>
                </TableCell>
                <TableCell className="w-56">
                  <CatalogPicker
                    customerId={customer.id}
                    customer={customer.name}
                    catalogs={catalogs}
                    value={customer.catalogId}
                  />
                </TableCell>
                <TableCell className="hidden text-end tabular-nums @2xl:table-cell">
                  {customer.orders.toLocaleString(locale)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground @3xl:table-cell">
                  {customer.lastOrderAt ? formatDate(customer.lastOrderAt, locale, timeZone) : "—"}
                </TableCell>
                {prices && (
                  <TableCell className="text-end">
                    <Amounts amounts={customer.spent} />
                  </TableCell>
                )}
              </LinkRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title={t("noneHere")} description={shared("tryAnother")} />
      )}
    </div>
  )
}
