"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState } from "@/components/common"
import { LinkRow } from "@/components/link-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { Amounts, IndexToolbar, matches } from "./shared"

type CatalogOption = { id: string; title: string; status: "active" | "draft" | "archived" }
const none = "none"

// What a customer without a catalog can order: every active product at its own price.
const noCatalogHint = "All products at list prices"

// Which catalog a customer sees, saved as soon as it's picked. "No catalog", as the list's tab calls it, offers every
// active product at its own price; `hint` says so under the select.
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
  const [current, setCurrent] = useState(value ?? none)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const options = [
    { value: none, label: "No catalog" },
    ...catalogs.map((catalog) => ({
      value: catalog.id,
      label: catalog.status === "active" ? catalog.title : `${catalog.title} (${catalog.status})`
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
        throw new Error((await response.json()).error ?? "Couldn't save. Try again.")
      }
      router.refresh()
    } catch (caught) {
      setCurrent(previous)
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={className}>
      <Select items={options} value={current} onValueChange={(next) => next && void choose(next)} disabled={pending}>
        <SelectTrigger aria-label={`Catalog for ${customer}`} className="w-full min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.value === none ? (
                <span className="flex flex-col">
                  {option.label}
                  <span className="text-xs text-muted-foreground">{noCatalogHint}</span>
                </span>
              ) : (
                option.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && current === none && !error && <p className="mt-2 text-xs text-muted-foreground">{noCatalogHint}</p>}
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
  const [tab, setTab] = useState<"all" | "open" | "none">("all")
  const [query, setQuery] = useState("")
  if (!customers.length) {
    return (
      <EmptyState
        title="No customers yet"
        description="Buyers appear here once they invite you as their supplier and you accept."
      />
    )
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
          { value: "all", label: "All", count: customers.length },
          { value: "open", label: "With open orders", count: customers.filter(tests.open).length },
          { value: "none", label: "No catalog", count: customers.filter(tests.none).length }
        ]}
        tab={tab}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        placeholder="Search customers"
      />
      {shown.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Catalog</TableHead>
              <TableHead className="hidden text-right @2xl:table-cell">Orders</TableHead>
              <TableHead className="hidden @3xl:table-cell">Last order</TableHead>
              <TableHead className="text-right">Amount spent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((customer) => (
              <LinkRow key={customer.id} href={`/customers/${customer.id}`}>
                <TableCell>
                  <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                    {customer.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {customer.open ? `${customer.open} open` : `Since ${formatDate(customer.createdAt)}`}
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
                <TableCell className="hidden text-right tabular-nums @2xl:table-cell">{customer.orders}</TableCell>
                <TableCell className="hidden text-muted-foreground @3xl:table-cell">
                  {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Amounts amounts={customer.spent} />
                </TableCell>
              </LinkRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="No customers here" description="Try another tab or search." />
      )}
    </div>
  )
}
