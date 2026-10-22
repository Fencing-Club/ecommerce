import { Plus, Trash2 } from "lucide-react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useMoney } from "@/hooks/use-money"
import type { ImportProposal } from "@/lib/import-proposal"
import type { importTotals } from "@/lib/import-totals"
import { cn } from "@/lib/utils"
import { WarningNote } from "./common"
import { AmountInput, blank, type Keyed } from "./import-review-lines"

export type ReviewCharge = Keyed<ImportProposal["adjustments"][number]>

// The import's cost summary: its charges, such as freight or a discount, then the products, charges and total beside
// the document's own total, and how far apart they are.
export function ImportCostSummary({
  charges,
  documentTotal,
  totals,
  currency,
  checking,
  onAddCharge,
  onEditCharge,
  onRemoveCharge,
  onDocumentTotalChange
}: {
  charges: ReviewCharge[]
  // As the document writes it.
  documentTotal: string | null
  // The lines' and charges', or null while one is incomplete.
  totals: ReturnType<typeof importTotals>
  currency: string | null
  // Once saving has been tried, what a charge still needs is marked.
  checking: boolean
  onAddCharge: () => void
  onEditCharge: (index: number, change: (charge: ReviewCharge) => void) => void
  onRemoveCharge: (index: number) => void
  onDocumentTotalChange: (value: string | null) => void
}) {
  const t = useTranslations("orders")
  const tr = useTranslations("orders.review")
  const money = useMoney()
  // A total, or a dash until the lines, charges and currency are complete.
  const summary = (minor: number | undefined) => (minor !== undefined && currency ? money(minor, currency) : "—")
  const flagged = (value: string | number | null) => checking && blank(value)
  return (
    <Card className="@5xl:col-start-2 @5xl:row-start-2">
      <CardHeader>
        <CardTitle>{t("detail.costSummary")}</CardTitle>
        <CardDescription>{tr("discountsNegative")}</CardDescription>
        <CardAction>
          <Button type="button" variant="outline" size="sm" disabled={charges.length >= 50} onClick={onAddCharge}>
            <Plus data-icon="inline-start" />
            {tr("addCharge")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {charges.length > 0 && (
          <ul className="flex flex-col gap-2">
            {charges.map((charge, index) => (
              <li key={charge.key} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
                <Input
                  aria-label={tr("charge", { number: index + 1 })}
                  placeholder={tr("description")}
                  required
                  aria-invalid={flagged(charge.description.trim())}
                  maxLength={255}
                  value={charge.description}
                  onChange={(e) => {
                    const value = e.target.value
                    onEditCharge(index, (target) => {
                      target.description = value
                    })
                  }}
                />
                <AmountInput
                  currency={currency}
                  aria-label={tr("chargeAmount", { number: index + 1 })}
                  placeholder="0.00"
                  required
                  aria-invalid={flagged(charge.amount)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="text-end tabular-nums"
                  value={charge.amount ?? ""}
                  onChange={(e) => {
                    const value = e.target.value
                    onEditCharge(index, (target) => {
                      target.amount = value || null
                    })
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tr("removeCharge", { number: index + 1 })}
                  onClick={() => onRemoveCharge(index)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <dl
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2",
            charges.length > 0 && "border-t pt-4"
          )}
        >
          <dt className="text-muted-foreground">{tr("products")}</dt>
          <dd className="text-end tabular-nums">{summary(totals?.products)}</dd>
          <dt className="text-muted-foreground">{tr("charges")}</dt>
          <dd className="text-end tabular-nums">{summary(totals?.adjustments)}</dd>
          <dt className="font-medium">{t("detail.columns.total")}</dt>
          <dd className="text-end font-medium tabular-nums">{summary(totals?.total)}</dd>
          <dt>
            <label htmlFor="import-document-total" className="text-muted-foreground">
              {tr("documentTotal")}
            </label>
          </dt>
          <dd>
            <AmountInput
              currency={currency}
              id="import-document-total"
              inputMode="decimal"
              autoComplete="off"
              className="w-28 text-end tabular-nums"
              value={documentTotal ?? ""}
              onChange={(e) => onDocumentTotalChange(e.target.value || null)}
            />
          </dd>
        </dl>
        {currency && totals && totals.difference !== null && totals.difference !== 0 && (
          <WarningNote>
            {totals.difference > 0
              ? tr("overDocumentTotal", { amount: money(totals.difference, currency) })
              : tr("underDocumentTotal", { amount: money(-totals.difference, currency) })}
          </WarningNote>
        )}
      </CardContent>
    </Card>
  )
}
