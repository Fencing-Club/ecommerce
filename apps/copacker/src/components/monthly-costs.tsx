"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { useActionForm } from "@/hooks/useActionForm"
import { ActionForm } from "./actions"
import { FormInput, FormNumber, FormSelect } from "./form-controls"
import * as styles from "./monthly-costs.css"
import { sx } from "@/styles/sprinkles.css"

const day = z.union([z.iso.date(), z.literal("")])
const schema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(100),
    amount: z.number({ error: "Enter the amount" }).int().min(1, "Enter the amount").max(100000000),
    channel: z.enum(["", "amazon", "shopify"]),
    startsOn: day,
    endsOn: day
  })
  .refine((values) => !values.startsOn || !values.endsOn || values.startsOn <= values.endsOn, {
    message: "The end date can't be before the start date",
    path: ["endsOn"]
  })

// The button that opens the monthly cost form in a dialog.
export function AddMonthlyCost({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus data-icon="inline-start" />
        Add cost
      </DialogTrigger>
      <DialogContent className={styles.dialog}>
        <DialogHeader>
          <DialogTitle>Add monthly cost</DialogTitle>
          <DialogDescription>A cost you pay every month, such as an app billed to a card.</DialogDescription>
        </DialogHeader>
        <MonthlyCostForm currency={currency} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

// Adds a cost paid every month, in the currency the Overview reports in.
function MonthlyCostForm({ currency, onSuccess }: { currency: string; onSuccess: () => void }) {
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
    <ActionForm form={form} onSubmit={submit} label="Add cost" dialog>
      <div className={sx({ display: "grid", gap: 3, gridTemplateColumns: { sm: "2" } })}>
        <FormInput name="name" required label="Name" placeholder="Marketplace Connect" />
        <FormNumber name="amount" required label={`Amount per month (${currency})`} scale={100} min={0} step="0.01" />
      </div>
      <FormSelect
        name="channel"
        label="Paid for"
        options={[
          { value: "", label: "The whole business" },
          { value: "amazon", label: "Amazon" },
          { value: "shopify", label: "Shopify" }
        ]}
        description="The Overview counts it for all channels, and for this channel when you filter by it."
      />
      <div className={sx({ display: "grid", gap: 3, gridTemplateColumns: { sm: "2" } })}>
        <FormInput
          name="startsOn"
          label="Paid since"
          type="date"
          description="Leave it empty if you've paid it for as long as your sales history."
        />
        <FormInput name="endsOn" label="Paid until" type="date" description="Leave it empty while you still pay it." />
      </div>
    </ActionForm>
  )
}
