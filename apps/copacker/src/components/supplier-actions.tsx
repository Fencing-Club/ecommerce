"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { commonPaymentTerms } from "@repo/aisle"
import { Pencil, Plus, Send } from "lucide-react"
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
import { errorMessage, useActionMutation } from "@/lib/api"
import { formErrorMap } from "@/lib/form-errors"
import { FormError } from "./actions"
import { FormInput, FormNumber } from "./form-controls"
import { SupplierForm } from "./settings-forms"
import { sx } from "@/styles/sprinkles.css"

export function InviteSupplier() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Add supplier
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a supplier</DialogTitle>
          <DialogDescription>For a supplier that isn’t in Shopify yet.</DialogDescription>
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
  leadTimeDays: z.number().int().min(1).max(730).optional(),
  amazonLeadTimeDays: z.number().int().min(1).max(730).optional(),
  paymentTerms: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(120),
  contactEmail: z.union([z.email({ error: "Enter a valid email" }).max(254), z.literal("")]),
  phoneNumber: z.string().trim().max(50),
  website: z.union([z.url({ protocol: /^https?$/, error: "Enter a full address, starting https://" }), z.literal("")])
})

type SupplierContact = {
  website: string | null
  contactName: string | null
  contactEmail: string | null
  phoneNumber: string | null
}

// A supplier's name, and the days from ordering until stock arrives, which restock uses for their products.
export function EditSupplier({
  id,
  name,
  shopifySupplierName,
  leadTimeDays,
  defaultLeadTimeDays,
  amazonLeadTimeDays,
  paymentTerms,
  contact,
  joined
}: {
  id: string
  name: string
  shopifySupplierName: string | null
  leadTimeDays: number | null
  // The workspace lead time an empty field falls back to.
  defaultLeadTimeDays: number
  amazonLeadTimeDays: number | null
  paymentTerms: string
  contact: SupplierContact
  // A supplier that joined keeps its own contact details.
  joined: boolean
}) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [open, setOpen] = useState(false)
  const form = useForm<z.input<typeof supplierSchema>, unknown, z.output<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema, { error: formErrorMap }),
    values: {
      name,
      shopifySupplierName: shopifySupplierName ?? "",
      leadTimeDays: leadTimeDays ?? undefined,
      amazonLeadTimeDays: amazonLeadTimeDays ?? undefined,
      paymentTerms,
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
          leadTimeDays: values.leadTimeDays ?? null,
          amazonLeadTimeDays: values.amazonLeadTimeDays ?? null,
          paymentTerms: values.paymentTerms,
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
      form.setError("root.server", { message: errorMessage(error, "Couldn’t save the supplier. Try again.") })
    }
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Edit ${name}`} />}>
        <Pencil data-icon="inline-start" />
        Edit
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
            <DialogHeader>
              <DialogTitle>Edit supplier</DialogTitle>
              <DialogDescription>Name, contact details and lead times.</DialogDescription>
            </DialogHeader>
            <FormInput name="name" required label="Name" autoComplete="organization" />
            <FormInput
              name="shopifySupplierName"
              label="Company name"
              description="As in Shopify’s Supplier field."
              placeholder="Not in Shopify"
              disabled
            />
            <FormInput name="contactName" label="Contact name" autoComplete="off" disabled={joined} />
            <FormInput name="contactEmail" label="Contact email" type="email" autoComplete="off" disabled={joined} />
            <FormInput name="phoneNumber" label="Phone" type="tel" autoComplete="off" disabled={joined} />
            <FormInput
              name="website"
              label="Website"
              type="url"
              placeholder="https://supplier.example"
              disabled={joined}
              description={joined ? `${name} keeps their contact details in their own workspace.` : undefined}
            />
            <FormNumber
              name="leadTimeDays"
              label="To your locations (days)"
              description={`From PO to sellable stock. Empty means ${defaultLeadTimeDays}.`}
              min={1}
              max={730}
              step={1}
            />
            <FormNumber
              name="amazonLeadTimeDays"
              label="To Amazon (days)"
              description="Includes Amazon’s receiving time."
              min={1}
              max={730}
              step={1}
            />
            <FormInput
              name="paymentTerms"
              required
              label="Payment terms"
              list="supplier-payment-terms"
              autoComplete="off"
              description="New POs start with these."
            />
            <datalist id="supplier-payment-terms">
              {commonPaymentTerms.map((terms) => (
                <option key={terms} value={terms} aria-label={terms} />
              ))}
            </datalist>
            <FormError message={form.formState.errors.root?.server?.message} />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
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
export function InviteSupplierByEmail({ id, name, email }: { id: string; name: string; email: string | null }) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [open, setOpen] = useState(false)
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
      form.setError("root.server", { message: errorMessage(error, `Couldn’t invite ${name}. Try again.`) })
    }
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Invite ${name}`} />}>
        <Send data-icon="inline-start" />
        Invite
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
            <DialogHeader>
              <DialogTitle>Invite {name}</DialogTitle>
              <DialogDescription>
                They’ll see the POs you share and get emailed when one needs documents.
              </DialogDescription>
            </DialogHeader>
            <FormInput name="email" required label="Supplier email" type="email" autoComplete="email" />
            <FormError message={form.formState.errors.root?.server?.message} />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
