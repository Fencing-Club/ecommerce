import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@buildkitgg/shadcn-baseui-kit"
import { Link, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { useLocale, useTimeZone, useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { EmptyState } from "@/components/common"
import { FramedTable } from "@/components/framed-table"
import { LinkRow } from "@/components/link-row"
import { IndexToolbar } from "@/components/list/index-toolbar"
import { matches } from "@/components/list/matches"
import { NoValue } from "@/components/no-value"
import { OptionSelect } from "@/components/option-select"
import { useErrorMessage } from "@/hooks/use-error-text"
import { formatDate } from "@/lib/format"
import { useAssignCatalogMutation } from "@/lib/supplier-api"
import { Amounts } from "./shared"

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
  const [assign, { isLoading: pending }] = useAssignCatalogMutation()
  const errorMessage = useErrorMessage()
  // Someone who can only view customers sees each one's catalog without changing it.
  const editable = useCan("customers", "edit")
  const options = [
    { value: none, label: t("noCatalog"), description: t("noCatalogHint") },
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
    setError("")
    try {
      await assign({ customerId, catalogId: next === none ? null : next }).unwrap()
      router.invalidate()
    } catch (caught) {
      setCurrent(previous)
      setError(errorMessage(caught, shared("couldNotSave")))
    }
  }

  return (
    <div className={className}>
      <OptionSelect
        options={options}
        value={current}
        onValueChange={(next) => void choose(next)}
        disabled={pending || !editable}
        label={t("catalogFor", { customer })}
        className="w-full min-w-44"
      />
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
        <FramedTable>
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
                  <Link
                    to="/customers/$id"
                    params={{ id: customer.id }}
                    className="focus-ring rounded-sm font-medium underline-offset-4 hover:underline"
                  >
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
                  {customer.lastOrderAt ? formatDate(customer.lastOrderAt, locale, timeZone) : <NoValue />}
                </TableCell>
                {prices && (
                  <TableCell className="text-end">
                    <Amounts amounts={customer.spent} />
                  </TableCell>
                )}
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
