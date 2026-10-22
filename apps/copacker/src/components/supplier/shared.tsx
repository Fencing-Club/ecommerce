import { useFormatter, useTranslations } from "use-intl"
import { StatusBadge as ToneBadge, type StatusTone } from "@/components/common"
import { NoValue } from "@/components/no-value"
import { StatCard } from "@/components/stat-card"
import { useMoney } from "@/hooks/use-money"

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

// Amounts in each currency, one under another, or a dash for none.
export function Amounts({ amounts }: { amounts: Array<{ currency: string; amount: number }> }) {
  const money = useMoney()
  if (!amounts.length) {
    return <NoValue />
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
