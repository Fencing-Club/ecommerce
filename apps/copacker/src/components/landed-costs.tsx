"use client"

import { z } from "zod"
import { useActionForm } from "@/hooks/useActionForm"
import { ActionForm } from "./actions"
import { FormInput, FormNumber, FormSelect } from "./form-controls"
import { sx } from "@/styles/sprinkles.css"

const schema = z.object({
  kind: z.enum(["freight", "duty", "other"]),
  description: z.string().trim().max(200),
  amount: z.number({ error: "Enter the amount" }).int().min(1, "Enter the amount").max(100000000)
})

// Adds a freight, duty or other bill to a PO, in the PO's currency.
export function LandedCostForm({ orderId, currency }: { orderId: string; currency: string }) {
  const { form, submit } = useActionForm({
    schema,
    action: "landedCost.create",
    defaultValues: { kind: "freight" as const, description: "", amount: undefined as unknown as number },
    toPayload: (values) => ({ ...values, orderId }),
    onSuccess: () => form.reset()
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Add cost">
      <div className={sx({ display: "grid", gap: 3, gridTemplateColumns: { sm: "2" } })}>
        <FormSelect
          name="kind"
          label="Type"
          options={[
            { value: "freight", label: "Freight" },
            { value: "duty", label: "Duty" },
            { value: "other", label: "Other" }
          ]}
        />
        <FormNumber name="amount" label={`Amount (${currency})`} scale={100} min={0} step="0.01" />
      </div>
      <FormInput
        name="description"
        label="Description (optional)"
        placeholder="Forwarder invoice, customs entry…"
        description={`Enter it in ${currency}, the PO’s currency. Convert a bill in another currency at the rate you paid.`}
      />
    </ActionForm>
  )
}
