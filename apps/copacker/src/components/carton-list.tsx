import type { OrderInput } from "@repo/copacker-orders"
import { Clock3 } from "lucide-react"
import type { ComponentProps } from "react"
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
import { CartonTable } from "./carton-table"
import { PackingActions, PackingEmpty, type PackingListActions, PackingSection } from "./packing-section"

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
  actions?: PackingListActions
  // An FBA packing that Amazon hasn't planned, so the cartons can't be checked against its packing groups.
  groupsUnchecked?: boolean
  error?: string
} & Omit<ComponentProps<typeof CartonTable>, "cartons" | "products" | "remainingPieces">) {
  const t = useTranslations("orders.packing")
  const importText = useTranslations("orders.cartonImport")
  const totals = cartonTotals(cartons)
  const packed = packedPieces(physicalCartons(cartons))
  const available = totalPiecesLeft(order.items, reserved)
  const labels = { add: t("addCarton"), import: importText("title"), export: importText("export") }
  return (
    <PackingSection
      title={t("cartons")}
      summary={t("packedUnits", { count: totals.pieces, available })}
      done={totals.pieces === available}
      // On a phone the units move to the line above the bar's button.
      summaryClassName="max-sm:hidden"
      actions={actions && cartons.length > 0 && <PackingActions actions={actions} labels={labels} />}
    >
      {groupsUnchecked && (
        <Alert role="note" className="p-4 has-[>svg]:gap-x-3 *:[svg]:text-muted-foreground">
          <Clock3 aria-hidden className="size-4.5" />
          <AlertTitle>{t("groupsUnchecked.title")}</AlertTitle>
          <AlertDescription className="text-meta">{t("groupsUnchecked.description")}</AlertDescription>
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
        <PackingEmpty title={t("noCartons")} description={actions && t("noCartonsDescription")}>
          {actions && <PackingActions empty actions={actions} labels={labels} />}
        </PackingEmpty>
      )}
      {error && <FormError message={error} />}
      {totals.cartons > maxCartons && <FormError message={importText("errors.limit")} />}
    </PackingSection>
  )
}
