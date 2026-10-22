import { Ellipsis, Plus } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { useAction } from "@/hooks/use-action"
import { useActionForm } from "@/hooks/useActionForm"
import { ActionForm } from "./action-form"
import { FormInput, FormMoney } from "./form-controls"
import { FormSelect } from "./form-select"

const day = z.union([z.iso.date(), z.literal("")])
const schema = z
  .object({
    name: z.string().trim().min(1, "settings.monthlyCosts.enterName").max(100),
    amount: z
      .number({ error: "settings.monthlyCosts.enterAmount" })
      .int()
      .min(1, "settings.monthlyCosts.enterAmount")
      .max(100000000),
    channel: z.enum(["", "amazon", "shopify", "ebay"]),
    startsOn: day,
    endsOn: day
  })
  .refine((values) => !values.startsOn || !values.endsOn || values.startsOn <= values.endsOn, {
    message: "settings.monthlyCosts.endBeforeStart",
    path: ["endsOn"]
  })

// A cost as the list shows it: its amount a month, and which channel it's for and when it's paid, such as
// "Amazon, since Jan 5, 2026".
type MonthlyCostRow = { id: string; name: string; amount: string; details: string }

// The workspace's monthly costs as one list, with Add in the card's header and Remove in each cost's menu.
export function MonthlyCosts({
  costs,
  currency,
  admin
}: {
  costs: MonthlyCostRow[]
  // New costs are in the currency the Overview reports in.
  currency: string
  // Only owners and admins add and remove costs.
  admin: boolean
}) {
  const t = useTranslations("settings.monthlyCosts")
  return (
    <Card className="gap-0 py-0">
      <div className="flex min-h-13 items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">{t("count", { count: costs.length })}</p>
        {admin && <AddMonthlyCost currency={currency} />}
      </div>
      {costs.length > 0 && (
        <ul className="divide-y border-t">
          {costs.map((cost) => (
            <MonthlyCostItem key={cost.id} cost={cost} admin={admin} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function MonthlyCostItem({ cost, admin }: { cost: MonthlyCostRow; admin: boolean }) {
  const t = useTranslations("settings.monthlyCosts")
  const remove = useAction("monthlyCost.delete", { fallback: t("removeFailed") })
  const { pending, error } = remove

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate font-medium">{cost.name}</p>
        <p className="text-xs text-muted-foreground">{cost.details}</p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <p className="shrink-0 text-end tabular-nums">{cost.amount}</p>
      {admin &&
        (pending ? (
          <Button variant="ghost" size="icon-sm" disabled aria-busy aria-label={t("removing", { name: cost.name })}>
            <Spinner />
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={t("more", { name: cost.name })} />}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem variant="destructive" onClick={() => void remove.run({ id: cost.id })}>
                {t("remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
    </li>
  )
}

// The button that opens the monthly cost form in a dialog.
function AddMonthlyCost({ currency }: { currency: string }) {
  const t = useTranslations("settings.monthlyCosts")
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus data-icon="inline-start" />
        {t("add")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
        </DialogHeader>
        <MonthlyCostForm currency={currency} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

// Adds a cost paid every month, in the currency the Overview reports in. Left empty, the dates cover all the sales
// history and every month since.
function MonthlyCostForm({ currency, onSuccess }: { currency: string; onSuccess: () => void }) {
  const t = useTranslations("settings.monthlyCosts")
  const { form, submit } = useActionForm({
    schema,
    action: "monthlyCost.create",
    defaultValues: {
      name: "",
      amount: undefined as unknown as number,
      channel: "" as const,
      startsOn: "",
      endsOn: ""
    },
    toPayload: (values) => ({
      name: values.name,
      amount: values.amount,
      currency,
      channel: values.channel || null,
      startsOn: values.startsOn || null,
      endsOn: values.endsOn || null
    }),
    onSuccess
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={t("add")} dialog>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput name="name" required label={t("name")} placeholder="Marketplace Connect" />
        <FormMoney name="amount" required label={t("amount")} currency={currency} />
      </div>
      <FormSelect
        name="channel"
        label={t("channel")}
        options={[
          { value: "", label: t("allChannels") },
          { value: "amazon", label: "Amazon" },
          { value: "shopify", label: "Shopify" },
          { value: "ebay", label: "eBay" }
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput name="startsOn" label={t("paidSince")} type="date" />
        <FormInput name="endsOn" label={t("paidUntil")} type="date" />
      </div>
    </ActionForm>
  )
}
