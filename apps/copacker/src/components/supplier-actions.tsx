import { FormProvider } from "react-hook-form"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { FormError } from "@/components/form-feedback"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { useActionForm } from "@/hooks/useActionForm"
import { contactDetailsSchema } from "@/lib/contact-details"
import { FormInput, FormNumber } from "./form-controls"
import { sx } from "@/styles/sprinkles.css"

const supplierSchema = z.object({
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
export function EditSupplier({ open, onOpenChange: setOpen, ...supplier }: Controlled & Supplier) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        {/* Mounted only while the dialog is open: each opening starts from the supplier as saved, and closing without
            saving drops the changes. */}
        <EditSupplierForm {...supplier} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function EditSupplierForm({
  id,
  name,
  shopifySupplierName,
  leadTimeDays,
  defaultLeadTimeDays,
  contact,
  joined,
  onSaved
}: Supplier & { onSaved: () => void }) {
  const t = useTranslations("partners.supplier.edit")
  const { form, submit } = useActionForm({
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
    fallback: t("failed"),
    onSuccess: onSaved
  })
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
        <DialogHeader>
          <DialogTitle>{t("title", { name })}</DialogTitle>
        </DialogHeader>
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
        <FormError message={form.formState.errors.root?.server?.message} />
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  )
}

const inviteSchema = z.object({ email: z.email().max(254) })

type Invitee = { id: string; name: string; email: string | null }

// Invites a supplier that hasn't joined to its own workspace, where it's notified of POs and provides their documents.
export function InviteSupplierByEmail({ open, onOpenChange: setOpen, ...supplier }: Controlled & Invitee) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        {/* Mounted only while the dialog is open, so each opening starts from the supplier's email. */}
        <InviteSupplierForm {...supplier} onSent={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function InviteSupplierForm({ id, name, email, onSent }: Invitee & { onSent: () => void }) {
  const t = useTranslations("partners.supplier.invite")
  const { form, submit } = useActionForm({
    schema: inviteSchema,
    action: "supplier.invite",
    defaultValues: { email: email ?? "" },
    toPayload: (values) => ({ id, email: values.email }),
    fallback: t("failed", { name }),
    onSuccess: onSent
  })
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
        <DialogHeader>
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <FormInput name="email" required label={t("email")} type="email" autoComplete="off" />
        <FormError message={form.formState.errors.root?.server?.message} />
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("sending") : t("submit")}
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  )
}
