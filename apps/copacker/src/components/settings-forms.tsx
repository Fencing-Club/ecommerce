"use client"

import { type Address, addressSchema } from "@repo/aisle"
import { useSyncExternalStore } from "react"
import { useWatch } from "react-hook-form"
import { z } from "zod"
import { useActionForm } from "@/hooks/useActionForm"
import { type ContactKind, contactKindLabels, contactKinds, contactKindsFor } from "@/lib/contacts"
import { timeZoneLabel } from "@/lib/time-zone"
import { ActionForm } from "./actions"
import { AddressFields, emptyAddress } from "./address-fields"
import { FormInput, FormSelect } from "./form-controls"
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
    <ActionForm form={form} onSubmit={submit} label="Add supplier">
      <FormInput name="name" label="Supplier company" placeholder="Ok Fencing" autoComplete="organization" />
      <FormInput
        name="email"
        label="Supplier email (optional)"
        type="email"
        placeholder="supplier@example.com"
        autoComplete="email"
        description="With an email, the supplier is invited to their own workspace, where they see only the orders you share. Without one, you can still send them POs and share the documents yourself."
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
      <FormInput name="contactName" label="Contact name (optional)" autoComplete="name" />
      <FormInput name="contactEmail" label="Contact email (optional)" type="email" autoComplete="email" />
      <FormInput name="phoneNumber" label="Phone (optional)" type="tel" autoComplete="tel" />
      <FormInput name="website" label="Website (optional)" type="url" placeholder="https://supplier.example" />
    </ActionForm>
  )
}

// The browser's time zone doesn't change while the page is open, so there's nothing to subscribe to.
const noSubscription = () => () => undefined
const timeZoneSchema = z.object({ timeZone: z.string() })

// The store's time zone: the Overview counts days and months in it. Left empty, it follows each viewer's computer.
export function TimeZoneForm({
  timeZone,
  zones
}: {
  timeZone: string | null
  zones: { value: string; label: string }[]
}) {
  const { form, submit } = useActionForm({
    schema: timeZoneSchema,
    action: "workspace.timeZone",
    defaultValues: { timeZone: timeZone ?? "" },
    keepSaved: true
  })
  // The computer's zone, named in the default choice. The server doesn't know it, so it's read after hydration.
  const browserZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null
  )
  return (
    <ActionForm form={form} onSubmit={submit} label="Save time zone">
      <FormSelect
        name="timeZone"
        label="Store time zone"
        description="Sales days and months start at midnight in this time zone."
        options={[
          {
            value: "",
            label: browserZone
              ? `Your computer’s time zone: ${timeZoneLabel(browserZone)}`
              : "Your computer’s time zone"
          },
          ...zones
        ]}
      />
    </ActionForm>
  )
}

const workspaceSchema = z.object({ name: z.string().trim().min(2).max(120), kind: z.enum(["buyer", "supplier"]) })

export function WorkspaceForm({ next }: { next?: string } = {}) {
  const { form, submit } = useActionForm({
    schema: workspaceSchema,
    action: "workspace.create",
    defaultValues: { name: "", kind: "buyer" },
    toPayload: (values) => ({ ...values, ...(next && { next }) })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Create workspace">
      <FormInput name="name" label="Company name" autoComplete="organization" />
      <FormSelect
        name="kind"
        label="Workspace type"
        options={[
          { value: "buyer", label: "Buyer: I place purchase orders" },
          { value: "supplier", label: "Supplier: I prepare orders and cartons" }
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
    <ActionForm form={form} onSubmit={submit} label={contact ? "Save changes" : "Save address"}>
      <div className={sx({ display: "grid", gap: 4, gridTemplateColumns: { sm: "2" } })}>
        <FormInput name="name" label="Address name" placeholder="Shenzhen warehouse" />
        {!supplier && (
          <FormSelect
            name="kind"
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
  workspaces
}: {
  token: string
  workspaces: Array<{ id: string; name: string }>
}) {
  const { form, submit } = useActionForm({
    schema: acceptSchema,
    action: "supplier.accept",
    defaultValues: { orgId: workspaces.length === 1 ? workspaces[0]!.id : "" },
    toPayload: (values) => ({ ...values, token })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Accept invitation">
      <FormSelect
        name="orgId"
        label="Supplier workspace"
        placeholder="Choose a workspace"
        options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
      />
    </ActionForm>
  )
}
