"use client"

import { type Address, addressSchema } from "@repo/aisle"
import { z } from "zod"
import { useActionForm } from "@/hooks/useActionForm"
import { ActionForm } from "./actions"
import { AddressFields, emptyAddress } from "./address-fields"
import { FormInput, FormSelect } from "./form-controls"
import { sx } from "@/styles/sprinkles.css"

const supplierSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.email().max(254) })

export function SupplierForm() {
  const { form, submit } = useActionForm({
    schema: supplierSchema,
    action: "supplier.create",
    defaultValues: { name: "", email: "" }
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Invite supplier">
      <FormInput name="name" label="Supplier company" placeholder="Ok Fencing" autoComplete="organization" />
      <FormInput
        name="email"
        label="Supplier email"
        type="email"
        placeholder="supplier@example.com"
        autoComplete="email"
        description="The supplier gets an invitation to their own workspace. They see only the orders you share with them."
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
  kind: z.enum(["pickup", "forwarder"]),
  address: addressSchema
})

type SavedContact = { id: string; name: string; kind: "pickup" | "forwarder"; address: Address }

export function ContactForm({ contact, onSuccess }: { contact?: SavedContact; onSuccess?: () => void }) {
  const { form, submit } = useActionForm({
    schema: contactSchema,
    action: contact ? "contact.update" : "contact.create",
    defaultValues: contact
      ? { name: contact.name, kind: contact.kind, address: { ...emptyAddress, ...contact.address } }
      : { name: "", kind: "pickup", address: emptyAddress },
    toPayload: (values) => ({ ...(contact && { id: contact.id }), ...values }),
    onSuccess
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={contact ? "Save changes" : "Save address"}>
      <div className={sx({ display: "grid", gap: 4, gridTemplateColumns: { sm: "2" } })}>
        <FormInput name="name" label="Address name" placeholder="Shenzhen warehouse" />
        <FormSelect
          name="kind"
          label="Address type"
          options={[
            { value: "pickup", label: "Pickup address" },
            { value: "forwarder", label: "Freight forwarder" }
          ]}
        />
      </div>
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
