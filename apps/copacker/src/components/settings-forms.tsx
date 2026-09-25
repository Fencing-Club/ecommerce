"use client"

import type { Address } from "@repo/aisle"
import { ActionForm } from "./actions"
import { SelectField, TextField } from "./form-fields"
import { AddressFields, readAddress } from "./packing-form"

export function SupplierForm() {
  return (
    <ActionForm action="supplier.create" label="Invite supplier">
      <TextField label="Supplier company" name="name" placeholder="Ok Fencing" required />
      <TextField
        label="Supplier email"
        name="email"
        type="email"
        placeholder="supplier@example.com"
        required
        description="The supplier gets an invitation to their own workspace. They see only the orders you share with them."
      />
    </ActionForm>
  )
}

export function WorkspaceForm({ next }: { next?: string } = {}) {
  return (
    <ActionForm action="workspace.create" label="Create workspace">
      {next && <input type="hidden" name="next" value={next} />}
      <TextField label="Company name" name="name" required />
      <SelectField
        label="Workspace type"
        id="kind"
        name="kind"
        defaultValue={next ? "supplier" : "buyer"}
        options={[
          { value: "buyer", label: "Buyer: I place purchase orders" },
          { value: "supplier", label: "Supplier: I prepare orders and cartons" }
        ]}
      />
    </ActionForm>
  )
}

type SavedContact = { id: string; name: string; kind: "pickup" | "forwarder"; address: Address }

export function ContactForm({ contact, onSuccess }: { contact?: SavedContact; onSuccess?: () => void }) {
  return (
    <ActionForm
      action={contact ? "contact.update" : "contact.create"}
      label={contact ? "Save changes" : "Save address"}
      onSuccess={onSuccess}
      transform={(f) => ({
        ...(contact && { id: contact.id }),
        name: f.get("contactName"),
        kind: f.get("kind"),
        address: readAddress(f)
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Address name"
          name="contactName"
          required
          placeholder="Shenzhen warehouse"
          defaultValue={contact?.name}
        />
        <SelectField
          label="Address type"
          id="kind"
          name="kind"
          defaultValue={contact?.kind}
          options={[
            { value: "pickup", label: "Pickup address" },
            { value: "forwarder", label: "Freight forwarder" }
          ]}
        />
      </div>
      <AddressFields address={contact?.address} />
    </ActionForm>
  )
}
