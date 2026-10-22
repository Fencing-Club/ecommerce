import { useWindowEvent } from "@mantine/hooks"
import { ChevronLeft, ChevronRight, ImageIcon, Search } from "lucide-react"
import { useFormatter, useLocale, useTranslations } from "use-intl"
import { StatusBadge as ToneBadge, type StatusTone } from "@/components/common"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMoney } from "@/hooks/use-money"
import type { ProductImage } from "@/lib/supplier-product"
import { imageUrl } from "@/lib/supplier-product"
import { cn } from "@/lib/utils"

// A product's main photo, or a placeholder in the same frame so rows line up.
export function ProductThumb({
  image,
  className
}: {
  image: Pick<ProductImage, "key" | "name"> | null
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40",
        className
      )}
    >
      {image ? (
        // Stored photos come from our own authenticated route using the browser's session cookie.
        <img src={imageUrl(image)} alt="" className="size-full object-contain" loading="lazy" />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
      )}
    </span>
  )
}

// A product's or catalog's status in the app's status tones: active is healthy, draft and archived are idle.
const statuses = {
  active: "success",
  draft: "neutral",
  archived: "neutral"
} as const satisfies Record<string, StatusTone>

export function StatusBadge({ status }: { status: keyof typeof statuses }) {
  const t = useTranslations("supplier.shared.status")
  return <ToneBadge tone={statuses[status]}>{t(status)}</ToneBadge>
}

// A row's link, stretched over the whole row (which needs `relative`) so a click anywhere on it opens the record, as a
// link: a middle click or Ctrl opens a new tab. Keyboard focus rings the row. Controls in the row sit above it with
// `relative z-10`.
export const rowLink =
  "underline-offset-4 outline-none after:absolute after:inset-0 hover:underline focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"

// Amounts in each currency, one under another, or a dash for none.
export function Amounts({ amounts }: { amounts: Array<{ currency: string; amount: number }> }) {
  const money = useMoney()
  if (!amounts.length) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span className="inline-flex flex-col items-end tabular-nums">
      {amounts.map((row) => (
        <span key={row.currency}>{money(row.amount, row.currency)}</span>
      ))}
    </span>
  )
}

// Amounts in each currency as a stat card, as the buyer Overview shows money: the first currency is the figure, the
// others are named beneath. A dash for none.
export function AmountsStat({
  label,
  amounts
}: {
  label: string
  amounts: Array<{ currency: string; amount: number }>
}) {
  const money = useMoney()
  const format = useFormatter()
  const t = useTranslations("overview")
  const [first, ...others] = amounts
  return (
    <StatCard
      label={label}
      value={first ? money(first.amount, first.currency) : "—"}
      caption={
        others.length > 0 &&
        t("plusCurrencies", {
          amounts: format.list(
            others.map((row) => money(row.amount, row.currency)),
            { type: "conjunction" }
          )
        })
      }
    />
  )
}

// The tabs and search above an index table, like Shopify's: each tab with its count.
export function IndexToolbar<T extends string>({
  tabs,
  tab,
  onTabChange,
  query,
  onQueryChange,
  placeholder,
  children
}: {
  tabs: Array<{ value: T; label: string; count?: number }>
  tab: T
  onTabChange: (value: T) => void
  query: string
  onQueryChange: (value: string) => void
  placeholder: string
  children?: React.ReactNode
}) {
  const locale = useLocale()
  return (
    <div className="flex min-w-0 flex-col gap-2 @3xl:flex-row @3xl:items-center @3xl:justify-between">
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as T)} className="min-w-0">
        {/* Scrolls sideways on a phone instead of wrapping, without a scrollbar. */}
        <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
          {tabs.map((option) => (
            <TabsTrigger key={option.value} value={option.value} className="px-2.5">
              {option.label}
              {option.count !== undefined && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {option.count.toLocaleString(locale)}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-2">
        <InputGroup className="@3xl:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </InputGroup>
        {children}
      </div>
    </div>
  )
}

export function matches(query: string, ...values: Array<string | null | undefined>) {
  const needle = query.trim().toLowerCase()
  return !needle || values.some((value) => value?.toLowerCase().includes(needle))
}

// Pages of a long table, like Shopify's: which rows show, and previous and next.
export function Pager({
  page,
  pages,
  total,
  size,
  onPage
}: {
  page: number
  pages: number
  total: number
  size: number
  onPage: (page: number) => void
}) {
  const t = useTranslations("supplier.shared.pager")
  if (pages <= 1) {
    return null
  }
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {t("range", { first: page * size + 1, last: Math.min(total, (page + 1) * size), total })}
      </span>
      <div className="flex gap-1">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t("previous")}
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t("next")}
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  )
}

// Shopify's contextual save bar: while a form has unsaved changes, a bar floats at the bottom with Discard and
// Save, and leaving the page asks first.
export function SaveBar({
  dirty,
  pending,
  onDiscard,
  onSave,
  error,
  message,
  canSave = true
}: {
  dirty: boolean
  pending: boolean
  onDiscard: () => void
  onSave: () => void
  error?: string
  // What's unsaved, such as "3 unsaved changes".
  message?: string
  // False while a change can't be saved yet, such as a count that isn't a number.
  canSave?: boolean
}) {
  const t = useTranslations("supplier.shared.saveBar")
  useWindowEvent("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault()
    }
  })
  if (!dirty && !error) {
    return null
  }
  return (
    <section
      aria-label={t("unsaved")}
      className="sticky bottom-4 z-30 mx-auto flex w-full max-w-xl flex-wrap items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 text-popover-foreground shadow-action-bar"
    >
      <span className={cn("text-sm font-medium", error && "text-destructive")}>{error || message || t("unsaved")}</span>
      <div className="ms-auto flex gap-2">
        <Button size="sm" variant="outline" disabled={pending || !dirty} onClick={onDiscard}>
          {t("discard")}
        </Button>
        <Button size="sm" disabled={pending || !dirty || !canSave} onClick={onSave}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </section>
  )
}
