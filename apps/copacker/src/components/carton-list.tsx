import type { OrderInput } from "@repo/copacker-orders"
import { Clock3 } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { useTranslations } from "use-intl"
import { FormError } from "@/components/form-feedback"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  type CartonGroup,
  cartonTotals,
  maxCartons,
  packedPieces,
  physicalCartons,
  piecesLeft,
  totalPiecesLeft
} from "@/lib/carton-groups"
import { cn } from "@/lib/utils"
import { CartonTable } from "./carton-table"
import { EmptyState } from "./common"

// The shipment's Cartons section: a row per carton configuration, and how many of the units left to ship they hold.
// While packing it has its actions (export, import and add), says when Amazon's packing groups can't be checked yet,
// and shows the errors of the cartons as a whole; packed, it lists the cartons as they are.
export function CartonList({
  order,
  cartons,
  reserved,
  actions,
  groupsUnchecked = false,
  error,
  ...table
}: {
  order: OrderInput
  cartons: CartonGroup[]
  // The pieces of each line the purchase order's other shipments hold.
  reserved: Readonly<Record<string, number>>
  actions?: ReactNode
  // An FBA packing that Amazon hasn't planned, so the cartons can't be checked against its packing groups.
  groupsUnchecked?: boolean
  error?: string
} & Omit<ComponentProps<typeof CartonTable>, "cartons" | "products" | "remainingPieces">) {
  const t = useTranslations("orders.packing")
  const importText = useTranslations("orders.cartonImport")
  const totals = cartonTotals(cartons)
  const packed = packedPieces(physicalCartons(cartons))
  const available = totalPiecesLeft(order.items, reserved)
  return (
    <section className="flex flex-col gap-4 max-sm:gap-5" aria-label={t("cartons")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* On a phone the units move to the line above the bar's button, and the actions keep only icons. */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold max-sm:text-base">{t("cartons")}</h2>
          <span
            className={cn(
              "text-xs tabular-nums text-muted-foreground max-sm:hidden",
              totals.pieces === available && "text-success"
            )}
          >
            {t("packedUnits", { count: totals.pieces, available })}
          </span>
        </div>
        {actions}
      </div>
      {groupsUnchecked && (
        <Alert role="note" className="p-4 has-[>svg]:gap-x-3 *:[svg]:text-muted-foreground">
          <Clock3 aria-hidden className="size-4.5" />
          <AlertTitle>{t("groupsUnchecked.title")}</AlertTitle>
          <AlertDescription className="text-[13px]">{t("groupsUnchecked.description")}</AlertDescription>
        </Alert>
      )}
      {cartons.length > 0 ? (
        <CartonTable
          {...table}
          cartons={cartons}
          products={order.items}
          remainingPieces={Object.fromEntries(
            order.items.map((item) => [item.id, piecesLeft(item, reserved) - (packed[item.id] ?? 0)])
          )}
        />
      ) : (
        <EmptyState title={t("noCartons")} description={t("noCartonsDescription")} />
      )}
      {error && <FormError message={error} />}
      {totals.cartons > maxCartons && <FormError message={importText("errors.limit")} />}
    </section>
  )
}
