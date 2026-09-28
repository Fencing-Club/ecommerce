"use client"

import Link from "next/link"
import { useState } from "react"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adjustmentLabel } from "@/lib/catalog-pricing"
import { IndexToolbar, matches, StatusBadge } from "./shared"

type CatalogRow = {
  id: string
  title: string
  status: "active" | "draft" | "archived"
  adjustmentBasisPoints: number
  products: number
  overrides: number
  customers: string[]
}

// Who a catalog is for, as Shopify lists a catalog's markets: the first name, then how many more.
function assigned(customers: string[]) {
  if (!customers.length) {
    return <span className="text-muted-foreground">No customers</span>
  }
  return customers.length === 1 ? customers[0] : `${customers[0]} and ${customers.length - 1} more`
}

export function CatalogIndex({ catalogs }: { catalogs: CatalogRow[] }) {
  const [tab, setTab] = useState<"all" | CatalogRow["status"]>("all")
  const [query, setQuery] = useState("")
  if (!catalogs.length) {
    return (
      <EmptyState
        title="Price your products for each customer"
        description="A catalog sets which products customers can order and at what prices, with discounts and volume pricing."
      >
        <Button nativeButton={false} render={<Link href="/catalogs/new" />}>
          Create catalog
        </Button>
      </EmptyState>
    )
  }
  const shown = catalogs.filter(
    (catalog) => (tab === "all" || catalog.status === tab) && matches(query, catalog.title, ...catalog.customers)
  )
  const count = (status: CatalogRow["status"]) => catalogs.filter((catalog) => catalog.status === status).length
  return (
    <div className="@container flex flex-col gap-3">
      <IndexToolbar
        tabs={[
          { value: "all", label: "All", count: catalogs.length },
          { value: "active", label: "Active", count: count("active") },
          { value: "draft", label: "Draft", count: count("draft") },
          { value: "archived", label: "Archived", count: count("archived") }
        ]}
        tab={tab}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        placeholder="Search catalogs"
      />
      {shown.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden @2xl:table-cell">Assigned to</TableHead>
              <TableHead className="hidden text-right @3xl:table-cell">Price overrides</TableHead>
              <TableHead className="hidden text-right @xl:table-cell">Overall adjustment</TableHead>
              <TableHead className="text-right">Products</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((catalog) => (
              <TableRow key={catalog.id}>
                <TableCell>
                  <Link href={`/catalogs/${catalog.id}`} className="font-medium hover:underline">
                    {catalog.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={catalog.status} />
                </TableCell>
                <TableCell className="hidden max-w-64 truncate @2xl:table-cell">
                  {assigned(catalog.customers)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums @3xl:table-cell">
                  {catalog.overrides || <span className="text-muted-foreground">None</span>}
                </TableCell>
                <TableCell className="hidden text-right @xl:table-cell">
                  {adjustmentLabel(catalog.adjustmentBasisPoints) ?? (
                    <span className="text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{catalog.products.toLocaleString("en-US")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="No catalogs here" description="Try another tab or search." />
      )}
    </div>
  )
}
