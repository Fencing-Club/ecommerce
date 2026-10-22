import { useTranslations } from "use-intl"
import { z } from "zod"
import { useActionForm } from "@/hooks/useActionForm"
import { ActionForm } from "./action-form"
import { FormInput } from "./form-controls"

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(254), z.literal("")])
})

export function SupplierForm({ onSuccess }: { onSuccess: () => void }) {
  const t = useTranslations("settings.supplierForm")
  const { form, submit } = useActionForm({
    schema: supplierSchema,
    action: "supplier.create",
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
