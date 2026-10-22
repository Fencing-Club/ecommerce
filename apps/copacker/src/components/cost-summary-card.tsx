import { useTranslations } from "use-intl"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useMoney } from "@/hooks/use-money"
import { adjustmentKeys, knownName } from "@/lib/order-lines"

// A purchase order's costs, in its editor and on its page: its lines with their pieces and what they come to, each
// charge (orderCharges), and the total. `action` sits in the header, such as the editor's Edit.
export function CostSummaryCard({
  lines,
  units,
  subtotal,
  charges,
  total,
  currency,
  action
}: {
  lines: number
  units: number
  subtotal: number
  charges: Array<{ description: string; amount: number }>
  total: number
  currency: string
  action?: React.ReactNode
}) {
  const t = useTranslations("orders")
  const money = useMoney()
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("detail.costSummary")}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="font-medium">{t("detail.orderDetails")}</p>
        <div className="flex justify-between gap-3">
          <span>{t("detail.variantsAndItems", { variants: lines, items: units })}</span>
          <span className="tabular-nums">{money(subtotal, currency)}</span>
        </div>
        {charges.map((charge) => (
          <div key={charge.description} className="flex justify-between gap-3">
            <span>{knownName(adjustmentKeys, charge.description, t)}</span>
            <span className="tabular-nums">{money(charge.amount, currency)}</span>
          </div>
        ))}
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>{t("detail.columns.total")}</span>
          <span className="tabular-nums">{money(total, currency)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
