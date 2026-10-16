"use client"

import { useTranslations } from "use-intl"
import { z } from "zod"
import { useSubmissionForm } from "@/hooks/use-submission-form"
import { useActionMutation } from "@/lib/api"
import { ActionForm } from "./action-form"
import { FormInput } from "./form-controls"

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(254), z.literal("")])
})

export function SupplierForm({ onSuccess }: { onSuccess: () => void }) {
  const t = useTranslations("settings.supplierForm")
  const [run] = useActionMutation()
  const { form, submit } = useSubmissionForm({
    schema: supplierSchema,
    run: (data) => run({ action: "supplier.create", data }).unwrap(),
    defaultValues: { name: "", email: "" },
    onSuccess
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={t("submit")} dialog>
      <FormInput name="name" required label={t("company")} placeholder="Northwind Textiles" autoComplete="off" />
      <FormInput
        name="email"
        label={t("email")}
        type="email"
        placeholder="supplier@example.com"
        autoComplete="off"
        description={t("emailDescription")}
      />
    </ActionForm>
  )
}
