import { ImageIcon } from "lucide-react"
import { useFormatter, useTranslations } from "use-intl"
import { StatusBadge as ToneBadge, type StatusTone } from "@/components/common"
import { StatCard } from "@/components/stat-card"
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
