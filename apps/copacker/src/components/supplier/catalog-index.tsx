import { Button, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@buildkitgg/shadcn"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { EmptyState, Status } from "@/components/common"
import { FramedTable } from "@/components/framed-table"
import { LinkRow } from "@/components/link-row"
import { IndexToolbar } from "@/components/list/index-toolbar"
import { matches } from "@/components/list/matches"
import { adjustmentLabel } from "@/lib/catalog-pricing"

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
          <Button nativeButton={false} render={<Link to="/catalogs/new" />}>
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
        <FramedTable>
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
              <LinkRow key={catalog.id} href={`/catalogs/${catalog.id}`}>
                <TableCell className="whitespace-normal">
                  <Link
                    to="/catalogs/$id"
                    params={{ id: catalog.id }}
                    className="focus-ring rounded-sm font-medium underline-offset-4 hover:underline"
                  >
                    {catalog.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Status status={catalog.status} labels="supplier" />
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
              </LinkRow>
            ))}
          </TableBody>
        </FramedTable>
      ) : (
        <EmptyState title={t("noneHere")} description={shared("tryAnother")} />
      )}
    </div>
  )
}
