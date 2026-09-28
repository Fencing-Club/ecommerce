"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { contactDetailsSchema } from "@/lib/contact-details"
import { FormError } from "./actions"
import { FormInput, FormNumber } from "./form-controls"
import { SupplierForm } from "./settings-forms"
import { sx } from "@/styles/sprinkles.css"

export function InviteSupplier({
  open: shown,
  onOpenChange
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("partners.supplier.add")
  const [own, setOwn] = useState(false)
  const open = shown ?? own
  const setOpen = onOpenChange ?? setOwn
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {shown === undefined && (
        <DialogTrigger render={<Button />}>
          <Plus data-icon="inline-start" />
          {t("trigger")}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <SupplierForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

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

// Opened from a partner's row, or its menu.
type Controlled = { open: boolean; onOpenChange: (open: boolean) => void }

// A supplier's name, and the days from ordering until stock arrives, which restock uses for their products.
export function EditSupplier({
  id,
  name,
  shopifySupplierName,
  leadTimeDays,
  defaultLeadTimeDays,
  contact,
  joined,
  open,
  onOpenChange: setOpen
}: Controlled & {
  id: string
  name: string
  shopifySupplierName: string | null
  leadTimeDays: number | null
  // The workspace lead time an empty field falls back to.
  defaultLeadTimeDays: number
  contact: SupplierContact
  // A supplier that joined keeps its own contact details.
  joined: boolean
}) {
  const t = useTranslations("partners.supplier.edit")
  const errorMessage = useErrorMessage()
  const formErrorMap = useFormErrorMap()
  const router = useRouter()
  const [run] = useActionMutation()
  const form = useForm<z.input<typeof supplierSchema>, unknown, z.output<typeof supplierSchema>>({
    resolver: zodResolver(joined ? joinedSupplierSchema : supplierSchema, { error: formErrorMap }),
    values: {
      name,
      shopifySupplierName: shopifySupplierName ?? "",
      leadTimeDays,
      contactName: contact.contactName ?? "",
      contactEmail: contact.contactEmail ?? "",
      phoneNumber: contact.phoneNumber ?? "",
      website: contact.website ?? ""
    }
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      await run({
        action: "supplier.update",
        data: {
          id,
          name: values.name,
          leadTimeDays: values.leadTimeDays,
          ...(!joined && {
            contactName: values.contactName,
            contactEmail: values.contactEmail,
            phoneNumber: values.phoneNumber,
            website: values.website
          })
        }
      }).unwrap()
      setOpen(false)
      router.refresh()
    } catch (error) {
      form.setError("root.server", { message: errorMessage(error, t("failed")) })
    }
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Closing without saving drops the changes.
        if (!next) {
          form.reset()
        }
      }}
    >
      <DialogContent>
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
            <FormInput
              name="contactEmail"
              label={t("contactEmail")}
              type="email"
              autoComplete="off"
              disabled={joined}
            />
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
      </DialogContent>
    </Dialog>
  )
}

const inviteSchema = z.object({ email: z.email().max(254) })

// Invites a supplier that hasn't joined to its own workspace, where it's notified of POs and provides their documents.
export function InviteSupplierByEmail({
  id,
  name,
  email,
  open,
  onOpenChange: setOpen
}: Controlled & { id: string; name: string; email: string | null }) {
  const t = useTranslations("partners.supplier.invite")
  const errorMessage = useErrorMessage()
  const formErrorMap = useFormErrorMap()
  const router = useRouter()
  const [run] = useActionMutation()
  const form = useForm<z.input<typeof inviteSchema>, unknown, z.output<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema, { error: formErrorMap }),
    values: { email: email ?? "" }
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      await run({ action: "supplier.invite", data: { id, email: values.email } }).unwrap()
      setOpen(false)
      router.refresh()
    } catch (error) {
      form.setError("root.server", { message: errorMessage(error, t("failed", { name })) })
    }
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
      <DialogContent>
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
      </DialogContent>
    </Dialog>
  )
}
