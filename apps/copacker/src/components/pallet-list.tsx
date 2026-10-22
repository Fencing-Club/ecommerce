import type { OrderInput } from "@repo/copacker-orders"
import type { ValidationIssue } from "@repo/copacker-packing-rules"
import { CircleAlert } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { useTranslations } from "use-intl"
import {
  type CartonGroup,
  cartonTotals,
  maxCartons,
  packedPallets,
  palletCartons,
  type PalletValue,
  physicalCartons
} from "@/lib/carton-groups"
import { cn } from "@/lib/utils"
import { EmptyState } from "./common"
import { usePalletIssueErrors } from "./packing-issues"
import { PalletTable } from "./pallet-table"

// The shipment's Pallets section, for cartons packed on pallets: a row per pallet, how many of the cartons are on one,
// and the pallet rules no one pallet breaks, such as cartons left off every pallet. While packing it has its actions
// (export, import and add); packed, it lists the pallets as they are.
export function PalletList({
  order,
  cartons,
  pallets,
  actions,
  issues = [],
  ...table
}: {
  order: OrderInput
  cartons: CartonGroup[]
  pallets: PalletValue[]
  actions?: ReactNode
  // The pallet rules the packing breaks, as validatePacking reports them.
  issues?: ValidationIssue[]
} & Omit<ComponentProps<typeof PalletTable>, "pallets" | "cartons" | "issues">) {
  const t = useTranslations("orders.pallets")
  const palletIssueErrors = usePalletIssueErrors()
  const physical = physicalCartons(cartons)
  // Pallets hold only the cartons the packing still has, as they'll be saved.
  const shown = packedPallets(pallets, physical)
  const onPallets = shown.reduce((sum, pallet) => sum + pallet.cartonIds.length, 0)
  const listed = issues.filter((issue) => !issue.palletId)
  return (
    <section className="flex flex-col gap-4 max-sm:gap-5" aria-label={t("title")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:flex-col max-sm:items-start">
          <h2 className="text-sm font-semibold max-sm:text-base">{t("title")}</h2>
          <span
            className={cn(
              "text-xs tabular-nums text-muted-foreground",
              physical.length > 0 && onPallets === physical.length && "text-success"
            )}
          >
            {t("onPallets", { count: onPallets, total: physical.length })}
          </span>
        </div>
        {actions}
      </div>
      {shown.length > 0 ? (
        <PalletTable
          {...table}
          pallets={shown}
          cartons={cartonTotals(cartons).cartons > maxCartons ? [] : palletCartons(cartons, order.items)}
          issues={issues}
        />
      ) : (
        <EmptyState title={t("noPallets")} description={t("noPalletsDescription")} />
      )}
      {listed.length > 0 && (
        <ul aria-live="polite" className="flex flex-col gap-2 text-meta text-destructive">
          {palletIssueErrors(listed).map((error) => (
            <li key={error.message} className="flex items-start gap-2">
              <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {error.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
