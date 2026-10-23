import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  DialogTrigger,
  DropdownMenuItem,
  Separator
} from "@buildkitgg/shadcn-baseui-kit"
import { Plus, Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "use-intl"
import { z } from "zod"
import { useCan } from "@/components/access"
import { FormError } from "@/components/form-feedback"
import { useAction } from "@/hooks/use-action"
import { useMoney } from "@/hooks/use-money"
import { cn } from "@/lib/utils"
import { FormInput, FormMoney } from "./form-controls"
import { FormDialog } from "./form-dialog"
import { FormSelect } from "./form-select"
import { InfoTip } from "./info-tip"
import { RowActionsMenu } from "./row-actions-menu"

const schema = z.object({
  kind: z.enum(["freight", "duty", "other"]),
  description: z.string().trim().max(200),
  amount: z
    .number({ error: "overview.landedCosts.enterAmount" })
    .int()
    .min(1, "overview.landedCosts.enterAmount")
    .max(100000000)
})

const kinds = ["freight", "duty", "other"] as const
// The orders page names a cost's kind in English ("Freight"); a kind's key works too.
const kindNames = { freight: "Freight", duty: "Duty", other: "Other" } as const
const kindKey = (kind: string) => kinds.find((key) => key === kind || kindNames[key] === kind)

// A PO's landed costs, the buyer's own record: Amazon's freight for its shipments and the bills recorded here, then
// what they add to the supplier's total. Amounts are in minor units of the PO's currency.
export function LandedCosts({
  orderId,
  currency,
  supplierTotal,
  landedTotal,
  markup,
  freight,
  costs
}: {
  orderId: string
  currency: string
  supplierTotal: number
  landedTotal: number
  markup: number | null
  freight: Array<{ reference: string; amount: number }>
  costs: Array<{ id: string; kind: string; description: string; amount: number }>
}) {
  const t = useTranslations("overview.landedCosts")
  const format = useFormatter()
  const money = useMoney()
  // Adding and removing costs changes the purchase order.
  const editable = useCan("orders", "edit")
  return (
    <Card size="sm">
      <CardHeader className="items-center">
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip label={t("aboutLabel")}>{t("about")}</InfoTip>
        </CardTitle>
        {editable && (
          <CardAction className="row-span-1 self-center">
            <AddLandedCost orderId={orderId} currency={currency} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {freight.length + costs.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {freight.map((row) => (
                <li key={row.reference} className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{t("amazonFreight")}</span>
                    <span className="text-xs text-muted-foreground">{t("shipment", { reference: row.reference })}</span>
                  </span>
                  <span className="tabular-nums">{money(row.amount, currency)}</span>
                  {/* Lines the amount up with the recorded costs', which have a menu after it. */}
                  {costs.length > 0 && <span aria-hidden className="size-7 shrink-0" />}
                </li>
              ))}
              {costs.map((cost) => (
                <CostRow key={cost.id} cost={cost} currency={currency} editable={editable} />
              ))}
            </ul>
            <Separator />
            <dl className="flex flex-col gap-1.5">
              <Total label={t("supplierTotal")} value={money(supplierTotal, currency)} />
              <Total label={t("title")} value={money(landedTotal, currency)} />
              <Total label={t("landedTotal")} value={money(supplierTotal + landedTotal, currency)} strong />
              {markup !== null && landedTotal > 0 && (
                <Total
                  label={t("markup")}
                  value={t("markupValue", {
                    percent: format.number(markup, { style: "percent", maximumFractionDigits: 1 })
                  })}
                />
              )}
            </dl>
          </>
        ) : (
          <p className="text-muted-foreground">{t("empty")}</p>
        )}
      </CardContent>
    </Card>
  )
}

function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", strong && "font-semibold")}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className="text-end tabular-nums">{value}</dd>
    </div>
  )
}

// A cost recorded on the PO, with a menu to remove it for someone who can change the PO.
function CostRow({
  cost,
  currency,
  editable
}: {
  cost: { id: string; kind: string; description: string; amount: number }
  currency: string
  editable: boolean
}) {
  const t = useTranslations("overview.landedCosts")
  const money = useMoney()
  const kind = kindKey(cost.kind)
  const kindName = kind ? t(`kinds.${kind}`) : cost.kind
  const remove = useAction("landedCost.delete")
  const { pending, error } = remove

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{kindName}</span>
          {cost.description && <span className="text-xs break-words text-muted-foreground">{cost.description}</span>}
        </span>
        <span className="tabular-nums">{money(cost.amount, currency)}</span>
        {editable && (
          <RowActionsMenu label={t("moreActions", { kind: kindName })} pending={pending}>
            <DropdownMenuItem variant="destructive" onClick={() => void remove.run({ id: cost.id })}>
              <Trash2 />
              {t("remove")}
            </DropdownMenuItem>
          </RowActionsMenu>
        )}
      </div>
      <FormError message={error} />
    </li>
  )
}

// Records a freight, duty or other bill against the PO, in the PO's currency, from a dialog.
function AddLandedCost({ orderId, currency }: { orderId: string; currency: string }) {
  const t = useTranslations("overview.landedCosts")
  return (
    <FormDialog
      trigger={
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus data-icon="inline-start" />
          {t("add")}
        </DialogTrigger>
      }
      title={t("addTitle")}
      description={t("addDescription", { currency })}
      submitLabel={t("add")}
      form={{
        schema,
        action: "landedCost.create",
        defaultValues: { kind: "freight", description: "" },
        toPayload: (values) => ({ ...values, orderId })
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
        <FormSelect
          name="kind"
          required
          label={t("type")}
          options={kinds.map((value) => ({ value, label: t(`kinds.${value}`) }))}
        />
        <FormMoney name="amount" required label={t("amount")} currency={currency} />
      </div>
      <FormInput name="description" label={t("description")} placeholder={t("descriptionPlaceholder")} />
    </FormDialog>
  )
}
