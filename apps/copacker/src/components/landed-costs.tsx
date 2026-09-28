"use client"

import { money } from "@repo/aisle"
import { Ellipsis, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { useActionForm } from "@/hooks/useActionForm"
import { errorMessage, useActionMutation } from "@/lib/api"
import { cn } from "@/lib/utils"
import { ActionForm, FormError } from "./actions"
import { FormInput, FormMoney, FormSelect } from "./form-controls"
import { InfoTip } from "./info-tip"

const schema = z.object({
  kind: z.enum(["freight", "duty", "other"]),
  description: z.string().trim().max(200),
  amount: z.number({ error: "Enter the amount" }).int().min(1, "Enter the amount").max(100000000)
})

const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 })

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
  return (
    <Card size="sm">
      <CardHeader className="items-center">
        <CardTitle className="flex items-center gap-1.5">
          Landed costs
          <InfoTip label="About landed costs">
            Freight, duty and other costs of getting these goods to you, added to unit costs on the Overview. Amazon’s
            freight for this purchase order’s shipments is added automatically. Only your team sees them.
          </InfoTip>
        </CardTitle>
        <CardAction className="row-span-1 self-center">
          <AddLandedCost orderId={orderId} currency={currency} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {freight.length + costs.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {freight.map((row) => (
                <li key={row.reference} className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">Amazon inbound freight</span>
                    <span className="text-xs text-muted-foreground">Shipment {row.reference}</span>
                  </span>
                  <span className="tabular-nums">{money(row.amount, currency)}</span>
                  {/* Lines the amount up with the recorded costs', which have a menu after it. */}
                  {costs.length > 0 && <span aria-hidden className="size-7 shrink-0" />}
                </li>
              ))}
              {costs.map((cost) => (
                <CostRow key={cost.id} cost={cost} currency={currency} />
              ))}
            </ul>
            <Separator />
            <dl className="flex flex-col gap-1.5">
              <Total label="Supplier total" value={money(supplierTotal, currency)} />
              <Total label="Landed costs" value={money(landedTotal, currency)} />
              <Total label="Landed total" value={money(supplierTotal + landedTotal, currency)} strong />
              {markup !== null && landedTotal > 0 && (
                <Total label="Markup" value={`${percent.format(markup)} on product cost`} />
              )}
            </dl>
          </>
        ) : (
          <p className="text-muted-foreground">No costs yet</p>
        )}
      </CardContent>
    </Card>
  )
}

function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", strong && "font-semibold")}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  )
}

// A cost recorded on the PO, with a menu to remove it.
function CostRow({
  cost,
  currency
}: {
  cost: { id: string; kind: string; description: string; amount: number }
  currency: string
}) {
  const router = useRouter()
  const [run, { isLoading }] = useActionMutation()
  const [refreshing, startRefresh] = useTransition()
  const [error, setError] = useState("")
  const pending = isLoading || refreshing

  async function remove() {
    setError("")
    try {
      await run({ action: "landedCost.delete", data: { id: cost.id } }).unwrap()
      startRefresh(() => router.refresh())
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{cost.kind}</span>
          {cost.description && <span className="text-xs break-words text-muted-foreground">{cost.description}</span>}
        </span>
        <span className="tabular-nums">{money(cost.amount, currency)}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-busy={pending}
                aria-label={`More actions for ${cost.kind.toLowerCase()} cost`}
              />
            }
          >
            {pending ? <Spinner /> : <Ellipsis />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
              <Trash2 />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <FormError message={error} />
    </li>
  )
}

// Records a freight, duty or other bill against the PO, in the PO's currency, from a dialog.
function AddLandedCost({ orderId, currency }: { orderId: string; currency: string }) {
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema,
    action: "landedCost.create",
    defaultValues: { kind: "freight", description: "" },
    toPayload: (values) => ({ ...values, orderId }),
    onSuccess: () => setOpen(false)
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          form.reset()
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus data-icon="inline-start" />
        Add cost
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add landed cost</DialogTitle>
          <DialogDescription>Convert a bill in another currency to {currency} at the rate you paid.</DialogDescription>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label="Add cost" dialog>
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
            <FormSelect
              name="kind"
              required
              label="Type"
              options={[
                { value: "freight", label: "Freight" },
                { value: "duty", label: "Duty" },
                { value: "other", label: "Other" }
              ]}
            />
            <FormMoney name="amount" required label="Amount" currency={currency} />
          </div>
          <FormInput name="description" label="Description" placeholder="Forwarder invoice, customs entry…" />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
