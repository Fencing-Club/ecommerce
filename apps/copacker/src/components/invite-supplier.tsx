import { useTranslations } from "use-intl"
import { newPartnerSchema } from "@/lib/partners"
import { FormInput } from "./form-controls"
import { FormDialog } from "./form-dialog"

// Adds a supplier that isn't in Shopify yet. With an email, it's invited to join and provide its POs' documents.
export function InviteSupplier({
  open,
  onOpenChange,
  finalFocus
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: React.RefObject<HTMLElement | null>
}) {
  const t = useTranslations("partners.supplier.add")
  const fields = useTranslations("settings.supplierForm")
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      title={t("title")}
      description={t("description")}
      submitLabel={fields("submit")}
      form={{ schema: newPartnerSchema, action: "supplier.create", defaultValues: { name: "", email: "" } }}
    >
      <FormInput name="name" required label={fields("company")} placeholder="Northwind Textiles" autoComplete="off" />
      <FormInput
        name="email"
        label={fields("email")}
        type="email"
        placeholder="supplier@example.com"
        autoComplete="off"
        description={fields("emailDescription")}
      />
    </FormDialog>
  )
}
