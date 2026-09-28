"use client"

import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useState } from "react"
import { useCan } from "@/components/access"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adjustmentLabel } from "@/lib/catalog-pricing"
import { cn } from "@/lib/utils"
import { IndexToolbar, matches, rowLink, StatusBadge } from "./shared"

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
function Assigned({ customers }: { customers: string[] }) {
  const t = useTranslations("supplier.catalogIndex")
  if (!customers.length) {
    return <span className="text-muted-foreground">{t("noCustomers")}</span>
  }
  return customers.length === 1
    ? customers[0]
    : t("assignedMore", { first: customers[0]!, count: customers.length - 1 })
}

export function CatalogIndex({ catalogs }: { catalogs: CatalogRow[] }) {
  const [tab, setTab] = useState<"all" | CatalogRow["status"]>("all")
  const [query, setQuery] = useState("")
  const editable = useCan("catalogs", "edit")
  const t = useTranslations("supplier.catalogIndex")
  const shared = useTranslations("supplier.shared")
  const pricing = useTranslations("supplier.pricing")
  const locale = useLocale()
  if (!catalogs.length) {
    return (
      <EmptyState title={t("emptyTitle")} description={t("emptyDescription")}>
        {editable && (
          <Button nativeButton={false} render={<Link href="/catalogs/new" />}>
            {t("create")}
          </Button>
        )}
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
          { value: "all", label: shared("all"), count: catalogs.length },
          { value: "active", label: shared("status.active"), count: count("active") },
          { value: "draft", label: shared("status.draft"), count: count("draft") },
          { value: "archived", label: shared("status.archived"), count: count("archived") }
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
              <TableHead>{t("columns.title")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="hidden @2xl:table-cell">{t("columns.assignedTo")}</TableHead>
              <TableHead className="hidden text-end @3xl:table-cell">{t("columns.overrides")}</TableHead>
              <TableHead className="hidden text-end @xl:table-cell">{t("columns.adjustment")}</TableHead>
              <TableHead className="text-end">{t("columns.products")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((catalog) => (
              <TableRow key={catalog.id} className="relative">
                <TableCell className="whitespace-normal">
                  <Link href={`/catalogs/${catalog.id}`} className={cn("font-medium", rowLink)}>
                    {catalog.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={catalog.status} />
                </TableCell>
                <TableCell className="hidden max-w-64 truncate @2xl:table-cell">
                  <Assigned customers={catalog.customers} />
                </TableCell>
                <TableCell className="hidden text-end tabular-nums @3xl:table-cell">
                  {catalog.overrides ? (
                    catalog.overrides.toLocaleString(locale)
                  ) : (
                    <span className="text-muted-foreground">{shared("none")}</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-end @xl:table-cell">
                  {adjustmentLabel(catalog.adjustmentBasisPoints, pricing) ?? (
                    <span className="text-muted-foreground">{shared("none")}</span>
                  )}
                </TableCell>
                <TableCell className="text-end tabular-nums">{catalog.products.toLocaleString(locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title={t("noneHere")} description={shared("tryAnother")} />
      )}
    </div>
  )
}
