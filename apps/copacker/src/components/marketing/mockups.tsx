import {
  Bell,
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Coffee,
  Factory,
  GlassWater,
  PanelLeft,
  Search,
  TrendingDown
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { Status } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Kbd } from "@/components/ui/kbd"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { navigationGroups, pagesFor } from "@/lib/navigation"
import { cn } from "@/lib/utils"

// The product as the marketing page shows it: the app's own components, in its light theme, holding a demo buyer's
// data, the same brand and suppliers as the ad (apps/video/docs/README.md). The shots are pictures: nothing in them can be focused or
// clicked, and screen readers get the figure's caption instead.

const nav = pagesFor("buyer")

// The app's window: the header with search, the sidebar with the buyer's pages, and the page itself. Plain boxes
// rather than header, aside and main, so the picture adds no landmarks to the page around it.
function AppFrame({ active, children }: { active: (typeof nav)[number]["view"]; children: React.ReactNode }) {
  const t = useTranslations("marketing.shot")
  const pages = useTranslations("navigation")
  return (
    <div
      inert
      className="light flex size-full flex-col overflow-hidden rounded-xl bg-background text-sm text-foreground select-none"
    >
      <div className="grid h-12 shrink-0 grid-cols-[1fr_minmax(0,26rem)_1fr] items-center gap-2 border-b px-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Box className="size-3.5" />
          </span>
          Copacker
        </span>
        <span className="flex h-8 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-muted-foreground">
          <Search className="size-3.5" />
          {t("search")}
          <span className="ms-auto flex gap-1">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </span>
        <Bell className="size-4 justify-self-end text-muted-foreground" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-56 shrink-0 flex-col gap-4 border-e bg-sidebar p-2 text-sidebar-foreground">
          <div className="flex items-center gap-2 rounded-lg p-2">
            <span className="flex size-8 items-center justify-center rounded-lg border bg-background text-xs font-semibold">
              RG
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate font-medium">Ridgeline Goods</span>
              <span className="text-xs text-muted-foreground">{t("buyerWorkspace")}</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </div>
          {navigationGroups.map((group) => {
            const items = nav.filter((item) => item.group === group.key)
            if (!items.length) {
              return null
            }
            return (
              <div key={group.key} className={cn("flex flex-col gap-0.5", group.key === "workspace" && "mt-auto")}>
                {group.labelKey && (
                  <span className="px-2 pb-1 text-xs text-muted-foreground">{pages(`groups.${group.labelKey}`)}</span>
                )}
                {items.map(({ view, labelKey, icon: Icon }) => (
                  <span
                    key={view}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-md px-2",
                      view === active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    {pages(`pages.${labelKey}`)}
                  </span>
                ))}
              </div>
            )
          })}
          <div className="flex items-center gap-2 p-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
              AR
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">Alex Rivera</span>
              <span className="truncate text-xs text-muted-foreground">alex@ridgelinegoods.com</span>
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-hidden px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function PageTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <PanelLeft className="size-4 text-muted-foreground" />
      <span className="text-xl font-semibold tracking-tight">{children}</span>
      {actions && <span className="ms-auto flex gap-2">{actions}</span>}
    </div>
  )
}

// A filter as Restock's toolbar shows one: a bordered chip with an icon and a value.
function Chip({ icon: Icon, children }: { icon?: typeof Box; children: React.ReactNode }) {
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5">
      {Icon && <Icon className="size-3.5 text-muted-foreground" />}
      {children}
    </span>
  )
}

function Thumb({ icon: Icon }: { icon: typeof Box }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/60 text-muted-foreground">
      <Icon className="size-4" />
    </span>
  )
}

const bottles = { name: "Steel Bottle 32 oz", sku: "SM-3201", icon: GlassWater }
const mugs = { name: "Trail Mug 12 oz", sku: "SM-1204", icon: Coffee }

// A quiet part of a filter chip's words.
const muted = (chunks: React.ReactNode) => <span className="text-muted-foreground">{chunks}</span>

// Restock: what runs out before a reorder could arrive, what it costs to order, and the sales at risk.
export function RestockShot() {
  const t = useTranslations("marketing.shot")
  const format = useFormatter()
  const dollars = (value: number) => format.number(value, { style: "currency", currency: "USD" })
  const rows = [
    { ...bottles, status: "reorder_now", left: 18, sold: 1830, available: 1140, order: 2520, cost: 11_340 },
    { ...mugs, status: "reorder_soon", left: 40, sold: 1020, available: 1380, order: 660, cost: 2310 }
  ]
  return (
    <AppFrame active="restock">
      <PageTitle>{t("restock")}</PageTitle>
      <div className="flex items-center gap-2">
        <Chip icon={Building2}>Ridgeline Goods</Chip>
        <Chip icon={Factory}>{t("allSuppliers")}</Chip>
        <Chip>{t.rich("salesPeriod", { muted, count: 60 })}</Chip>
        <Chip>{t.rich("leadTime", { muted, count: 60 })}</Chip>
      </div>
      <Card className="gap-4">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">{t("estimatedCost")}</span>
              <span className="text-3xl font-semibold tracking-tight">{dollars(15_090)}</span>
            </div>
            <dl className="grid grid-cols-5 gap-x-8 gap-y-1 text-end">
              {[
                [t("lines"), format.number(3)],
                [t("units"), format.number(3660)],
                [t("cases"), format.number(180)],
                [t("volume"), `${format.number(6.12)} m³`],
                [t("weight"), format.number(1820, { style: "unit", unit: "kilogram" })]
              ].map(([term, value]) => (
                <div key={term} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{term}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
            <TrendingDown className="size-4" />
            {t("lostSales", {
              amount: format.number(18_340, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
            })}
          </div>
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <ChevronDown className="size-4 text-muted-foreground" />
          <span className="flex flex-col">
            <span>
              <span className="font-semibold">Shenzhen Metalworks</span>{" "}
              <span className="text-muted-foreground">{t("products", { count: 2 })}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {t("supplierSummary", { days: 60, lines: 2, units: 3180 })}
            </span>
          </span>
          <span className="ms-auto flex flex-col items-end">
            <span className="text-xs text-muted-foreground">{t("estimatedCost")}</span>
            <span className="font-semibold">{dollars(13_650)}</span>
          </span>
          <Button>{t("reorder")}</Button>
        </div>
        <Table framed={false}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>{t("columns.product")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-end">{t("columns.stockLeft")}</TableHead>
              <TableHead className="text-end">{t("columns.sold")}</TableHead>
              <TableHead className="text-end">{t("columns.available")}</TableHead>
              <TableHead className="text-end">{t("columns.order")}</TableHead>
              <TableHead className="text-end">{t("columns.cost")}</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.sku}>
                <TableCell>
                  <Checkbox checked />
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <Thumb icon={row.icon} />
                    <span className="flex flex-col">
                      <span className="font-medium">{row.name}</span>
                      <span className="text-xs text-muted-foreground">{row.sku}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <Status status={row.status} />
                </TableCell>
                <TableCell className="text-end tabular-nums">{t("days", { count: row.left })}</TableCell>
                <TableCell className="text-end tabular-nums">{format.number(row.sold)}</TableCell>
                <TableCell className="text-end tabular-nums">{format.number(row.available)}</TableCell>
                <TableCell className="text-end font-medium tabular-nums">{format.number(row.order)}</TableCell>
                <TableCell className="text-end tabular-nums">{dollars(row.cost)}</TableCell>
                <TableCell>
                  <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card className="py-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
          <span className="flex flex-col">
            <span>
              <span className="font-semibold">Saigon Packaging Co.</span>{" "}
              <span className="text-muted-foreground">{t("products", { count: 1 })}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {t("supplierSummary", { days: 45, lines: 1, units: 480 })}
            </span>
          </span>
          <span className="ms-auto flex flex-col items-end">
            <span className="text-xs text-muted-foreground">{t("estimatedCost")}</span>
            <span className="font-semibold">{dollars(1440)}</span>
          </span>
          <Button variant="outline">{t("reorder")}</Button>
        </div>
      </Card>
    </AppFrame>
  )
}
