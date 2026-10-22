import { useTranslations } from "use-intl"
import { newPartnerSchema } from "@/lib/partners"
import { FormInput } from "./form-controls"
import { FormDialog } from "./form-dialog"

// Adds a freight forwarder. With an email, it's invited to join and keep its own addresses.
export function AddForwarder({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("partners.forwarder.add")
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      submitLabel={t("submit")}
      form={{ schema: newPartnerSchema, action: "forwarder.create", defaultValues: { name: "", email: "" } }}
    >
      <FormInput name="name" required label={t("company")} placeholder={t("companyPlaceholder")} autoComplete="off" />
      <FormInput
        name="email"
        label={t("email")}
        type="email"
        placeholder="ops@forwarder.example"
        autoComplete="off"
        description={t("emailDescription")}
      />
    </FormDialog>
  )
}
