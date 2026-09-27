"use client"

import { type Address, addressSchema } from "@repo/aisle"
import { useSyncExternalStore } from "react"
import { useWatch } from "react-hook-form"
import { z } from "zod"
import { useActionForm } from "@/hooks/useActionForm"
import { type ContactKind, contactKindLabels, contactKinds, contactKindsFor } from "@/lib/contacts"
import { timeZoneLabel } from "@/lib/time-zone"
import { dayRange } from "@/server/restock-report"
import { ActionForm } from "./actions"
import { AddressFields, emptyAddress } from "./address-fields"
import { FormInput, FormNumber, FormSelect } from "./form-controls"
import { sx } from "@/styles/sprinkles.css"

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(254), z.literal("")])
})

export function SupplierForm({ onSuccess }: { onSuccess?: () => void }) {
  const { form, submit } = useActionForm({
    schema: supplierSchema,
    action: "supplier.create",
    defaultValues: { name: "", email: "" },
    onSuccess
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Add supplier" dialog>
      <FormInput name="name" required label="Supplier company" placeholder="Ok Fencing" autoComplete="organization" />
      <FormInput
        name="email"
        label="Email"
        type="email"
        placeholder="supplier@example.com"
        autoComplete="email"
        description="Add one to invite them now."
      />
    </ActionForm>
  )
}

const supplierProfileSchema = z.object({
  contactName: z.string().trim().max(120),
  contactEmail: z.union([z.email({ error: "Enter a valid email" }).max(254), z.literal("")]),
  phoneNumber: z.string().trim().max(50),
  website: z.union([z.url({ protocol: /^https?$/, error: "Enter a full address, starting https://" }), z.literal("")])
})

// The supplier's contact details, which their buyers see. All optional.
export function SupplierProfileForm(profile: z.input<typeof supplierProfileSchema>) {
  const { form, submit } = useActionForm({
    schema: supplierProfileSchema,
    action: "supplier.profile",
    defaultValues: profile,
    keepSaved: true
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Save profile">
      <FormInput name="contactName" label="Contact name" autoComplete="name" />
      <FormInput name="contactEmail" label="Contact email" type="email" autoComplete="email" />
      <FormInput name="phoneNumber" label="Phone" type="tel" autoComplete="tel" />
      <FormInput name="website" label="Website" type="url" placeholder="https://supplier.example" />
    </ActionForm>
  )
}

// The browser's time zone doesn't change while the page is open, so there's nothing to subscribe to.
const noSubscription = () => () => undefined
const restockSchema = z.object({
  salesDays: z.number({ error: "Enter the days" }).int().min(dayRange.min).max(dayRange.max),
  leadTimeDays: z.number({ error: "Enter the days" }).int().min(dayRange.min).max(dayRange.max)
})

// The sales period and default lead time Restock starts from and the Overview uses.
export function RestockSettingsForm(values: z.input<typeof restockSchema>) {
  const { form, submit } = useActionForm({
    schema: restockSchema,
    action: "workspace.restock",
    defaultValues: values,
    keepSaved: true
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Save">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormNumber
          name="salesDays"
          required
          label="Sales period (days)"
          min={dayRange.min}
          max={dayRange.max}
          step={1}
        />
        <FormNumber
          name="leadTimeDays"
          required
          label="Lead time (days)"
          description="For suppliers without their own."
          min={dayRange.min}
          max={dayRange.max}
          step={1}
        />
      </div>
    </ActionForm>
  )
}

const timeZoneSchema = z.object({ timeZone: z.string() })

// The store's time zone: the Overview counts days and months in it. Left empty, it follows each viewer's computer.
export function TimeZoneForm({
  timeZone,
  computerZone,
  zones
}: {
  timeZone: string | null
  // The computer's zone as last reported to the server, shown until the browser's own is read.
  computerZone: string
  zones: { value: string; label: string }[]
}) {
  const { form, submit } = useActionForm({
    schema: timeZoneSchema,
    action: "workspace.timeZone",
    defaultValues: { timeZone: timeZone ?? "" },
    keepSaved: true
  })
  // The computer's zone, named in the default choice.
  const browserZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => computerZone
  )
  return (
    <ActionForm form={form} onSubmit={submit} label="Save time zone">
      <FormSelect
        name="timeZone"
        label="Store time zone"
        options={[
          {
            value: "",
            label: timeZoneLabel(browserZone)
          },
          ...zones
        ]}
      />
    </ActionForm>
  )
}

const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["buyer", "supplier", "forwarder"])
})

export function WorkspaceForm({
  next,
  kind = "buyer"
}: { next?: string; kind?: z.input<typeof workspaceSchema>["kind"] } = {}) {
  const { form, submit } = useActionForm({
    schema: workspaceSchema,
    action: "workspace.create",
    defaultValues: { name: "", kind },
    toPayload: (values) => ({ ...values, ...(next && { next }) })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Create workspace">
      <FormInput name="name" required label="Company name" autoComplete="organization" />
      <FormSelect
        name="kind"
        required
        label="Workspace type"
        options={[
          { value: "buyer", label: "Buyer: I place purchase orders" },
          { value: "supplier", label: "Supplier: I prepare orders and cartons" },
          { value: "forwarder", label: "Freight forwarder: I receive and ship goods" }
        ]}
      />
    </ActionForm>
  )
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(contactKinds),
  address: addressSchema,
  // Empty when a delivery address isn't linked to a Shopify location.
  shopifyLocationId: z.string()
})

type SavedContact = {
  id: string
  name: string
  kind: ContactKind
  address: Address
  shopifyLocationId: string | null
}

export function ContactForm({
  contact,
  onSuccess,
  supplier = false,
  locations = []
}: {
  contact?: SavedContact
  onSuccess?: () => void
  supplier?: boolean
  locations?: { id: string; name: string }[]
}) {
  const { form, submit } = useActionForm({
    schema: contactSchema,
    action: contact ? "contact.update" : "contact.create",
    defaultValues: contact
      ? {
          name: contact.name,
          kind: contact.kind,
          address: { ...emptyAddress, ...contact.address },
          shopifyLocationId: contact.shopifyLocationId ?? ""
        }
      : { name: "", kind: supplier ? "pickup" : "delivery", address: emptyAddress, shopifyLocationId: "" },
    toPayload: (values) => ({
      ...(contact && { id: contact.id }),
      ...values,
      shopifyLocationId: values.shopifyLocationId || null
    }),
    onSuccess
  })
  const kind = useWatch({ control: form.control, name: "kind" })
  return (
    <ActionForm form={form} onSubmit={submit} label={contact ? "Save changes" : "Save address"} dialog>
      <div className={sx({ display: "grid", gap: 4, gridTemplateColumns: { sm: "2" } })}>
        <FormInput name="name" required label="Address name" placeholder="Shenzhen warehouse" />
        {!supplier && contactKindsFor("buyer").length > 1 && (
          <FormSelect
            name="kind"
            required
            label="Address type"
            options={contactKindsFor("buyer").map((kind) => ({ value: kind, label: contactKindLabels[kind] }))}
          />
        )}
      </div>
      {!supplier && kind === "delivery" && locations.length > 0 && (
        <FormSelect
          name="shopifyLocationId"
          label="Shopify location"
          description="POs sent here show as on order at this location."
          placeholder="Not linked"
          options={locations.map((location) => ({ value: location.id, label: location.name }))}
        />
      )}
      <AddressFields path="address" />
    </ActionForm>
  )
}

const acceptSchema = z.object({ orgId: z.uuid() })

export function AcceptSupplierInvitation({
  token,
  workspaces,
  forwarder = false
}: {
  token: string
  workspaces: Array<{ id: string; name: string }>
  // A forwarder's invitation joins a forwarder workspace instead of a supplier one.
  forwarder?: boolean
}) {
  const { form, submit } = useActionForm({
    schema: acceptSchema,
    action: forwarder ? "forwarder.accept" : "supplier.accept",
    defaultValues: { orgId: workspaces.length === 1 ? workspaces[0]!.id : "" },
    toPayload: (values) => ({ ...values, token })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Accept invitation">
      <FormSelect
        name="orgId"
        required
        label={forwarder ? "Forwarder workspace" : "Supplier workspace"}
        placeholder="Choose a workspace"
        options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
      />
    </ActionForm>
  )
}
