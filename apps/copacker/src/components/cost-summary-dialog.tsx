import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@buildkitgg/shadcn-baseui-kit"
import { adjustmentTypes } from "@repo/copacker-orders"
import { Plus, X } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { MoneyInput } from "@/components/money-input"
import { adjustmentKeys, knownName } from "@/lib/order-lines"

type Adjustment = { description: string; amount: number }
// An adjustment as it's edited: its type, and its amount in minor units without its sign, which a discount takes.
type AdjustmentRow = { key: string; type: string; amount: number | null }

// Words only screen readers say, in a translated sentence.
const screenReaderOnly = (chunks: React.ReactNode) => <span className="sr-only">{chunks}</span>

// The purchase order editor's charges and discounts, such as shipping or a discount, which the cost summary adds to
// the products. A PO's own types stay choosable beside the standard ones. Saving replaces them all.
export function CostSummaryDialog({
  currency,
  adjustments,
  onSave
}: {
  currency: string
  adjustments: Adjustment[]
  onSave: (rows: Adjustment[]) => void
}) {
  const t = useTranslations("orders")
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AdjustmentRow[]>([])
  const types = [
    ...adjustmentTypes,
    ...adjustments.map((row) => row.description).filter((type) => !adjustmentTypes.some((known) => known === type))
  ].map((type) => ({ value: type, label: knownName(adjustmentKeys, type, t) }))
  const complete = rows.every((row) => row.type && row.amount !== null)
  function start() {
    setRows(
      adjustments.map((row) => ({ key: crypto.randomUUID(), type: row.description, amount: Math.abs(row.amount) }))
    )
    setOpen(true)
  }
  function save() {
    onSave(
      rows.map((row) => {
        const amount = row.amount ?? 0
        return { description: row.type, amount: row.type === "Discount" ? -amount : amount }
      })
    )
    setOpen(false)
  }
  const update = (key: string, change: Partial<AdjustmentRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)))
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={start}>
        {t.rich("builder.editCostSummary", { hidden: screenReaderOnly })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("builder.editCostSummaryTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {rows.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] gap-2 text-muted-foreground">
                <span>{t("builder.adjustment")}</span>
                <span>{t("builder.amount")}</span>
              </div>
            )}
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] items-center gap-2">
                <Select
                  items={types}
                  value={row.type || null}
                  onValueChange={(type) => update(row.key, { type: type ?? "" })}
                >
                  <SelectTrigger aria-label={t("builder.adjustment")} className="w-full">
                    <SelectValue>
                      {(type: string | null) =>
                        type === null ? t("builder.select") : knownName(adjustmentKeys, type, t)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {types.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <MoneyInput
                  label={t("builder.amount")}
                  currency={currency}
                  value={row.amount}
                  onValueChange={(amount) => update(row.key, { amount })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("builder.removeAdjustment")}
                  onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={rows.length >= 50}
              onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), type: "", amount: null }])}
            >
              <Plus data-icon="inline-start" />
              {t("builder.addAdjustment")}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("actions.cancel")}</DialogClose>
            <Button type="button" disabled={!complete} onClick={save}>
              {t("builder.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
