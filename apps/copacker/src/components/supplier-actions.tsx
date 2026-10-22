import { useTranslations } from "use-intl"
import { z } from "zod"
import { contactDetailsSchema } from "@/lib/contact-details"
import { inviteSchema } from "@/lib/partners"
import { FormInput, FormNumber } from "./form-controls"
import { FormDialog } from "./form-dialog"

const supplierSchema = z.object({
  // A supplier's new name needs one character, as the server checks it.
  name: z.string().trim().min(1).max(120),
  // Shown, not edited: it comes from Shopify's Supplier field.
  shopifySupplierName: z.string(),
  // Empty clears the supplier's own, so the workspace's applies.
  leadTimeDays: z.number().int().min(1).max(730).nullable(),
  ...contactDetailsSchema.shape
})
// A supplier that joined keeps its own contact details, which are shown as it saved them and not sent, so they aren't
// checked here.
const joinedSupplierSchema = supplierSchema.extend({
  contactName: z.string(),
  contactEmail: z.string(),
  phoneNumber: z.string(),
  website: z.string()
})

type SupplierContact = {
  website: string | null
  contactName: string | null
  contactEmail: string | null
  phoneNumber: string | null
}

type Supplier = {
  id: string
  name: string
  shopifySupplierName: string | null
  leadTimeDays: number | null
  // The workspace lead time an empty field falls back to.
  defaultLeadTimeDays: number
  contact: SupplierContact
  // A supplier that joined keeps its own contact details.
  joined: boolean
}

// Opened from a partner's row, or its menu.
type Controlled = { open: boolean; onOpenChange: (open: boolean) => void }

// A supplier's name, and the days from ordering until stock arrives, which restock uses for their products.
export function EditSupplier({
  open,
  onOpenChange,
  id,
  name,
  shopifySupplierName,
  leadTimeDays,
  defaultLeadTimeDays,
  contact,
  joined
}: Controlled & Supplier) {
  const t = useTranslations("partners.supplier.edit")
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name })}
      submitLabel={t("save")}
      form={{
        schema: joined ? joinedSupplierSchema : supplierSchema,
        action: "supplier.update",
        defaultValues: {
          name,
          shopifySupplierName: shopifySupplierName ?? "",
          leadTimeDays,
          contactName: contact.contactName ?? "",
          contactEmail: contact.contactEmail ?? "",
          phoneNumber: contact.phoneNumber ?? "",
          website: contact.website ?? ""
        },
        toPayload: (values) => ({
          id,
          name: values.name,
          leadTimeDays: values.leadTimeDays,
          ...(!joined && {
            contactName: values.contactName,
            contactEmail: values.contactEmail,
            phoneNumber: values.phoneNumber,
            website: values.website
          })
        }),
        fallback: t("failed")
      }}
    >
      <FormInput name="name" required label={t("name")} autoComplete="off" />
      <FormInput
        name="shopifySupplierName"
        label={t("companyName")}
        description={t("companyNameDescription")}
        placeholder={t("companyNamePlaceholder")}
        disabled
      />
      <FormInput name="contactName" label={t("contactName")} autoComplete="off" disabled={joined} />
      <FormInput name="contactEmail" label={t("contactEmail")} type="email" autoComplete="off" disabled={joined} />
      <FormInput name="phoneNumber" label={t("phone")} type="tel" autoComplete="off" disabled={joined} />
      <FormInput
        name="website"
        label={t("website")}
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="example.com"
        disabled={joined}
        description={joined ? t("websiteJoined", { name }) : undefined}
      />
      <FormNumber
        name="leadTimeDays"
        label={t("leadTime")}
        description={t("leadTimeDescription", { days: defaultLeadTimeDays })}
        min={1}
        max={730}
        step={1}
      />
    </FormDialog>
  )
}

type Invitee = { id: string; name: string; email: string | null }

// Invites a supplier that hasn't joined to its own workspace, where it's notified of POs and provides their documents.
export function InviteSupplierByEmail({ open, onOpenChange, id, name, email }: Controlled & Invitee) {
  const t = useTranslations("partners.supplier.invite")
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name })}
      description={t("description")}
      submitLabel={t("submit")}
      form={{
        schema: inviteSchema,
        action: "supplier.invite",
        defaultValues: { email: email ?? "" },
        toPayload: (values) => ({ id, email: values.email }),
        fallback: t("failed", { name })
      }}
    >
      <FormInput name="email" required label={t("email")} type="email" autoComplete="off" />
    </FormDialog>
  )
}
