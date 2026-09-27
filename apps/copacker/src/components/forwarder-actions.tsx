"use client"

import { type Address, addressSchema } from "@repo/aisle"
import { MapPinPlus, Pencil, Plus, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { z } from "zod"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { useActionForm } from "@/hooks/useActionForm"
import { errorMessage, useActionMutation } from "@/lib/api"
import { ActionForm, FormError } from "./actions"
import { AddressFields, emptyAddress } from "./address-fields"
import { FormInput } from "./form-controls"

const addSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(254), z.literal("")])
})

// Adds a freight forwarder. With an email, it's invited to join and keep its own addresses.
export function AddForwarder() {
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema: addSchema,
    action: "forwarder.create",
    defaultValues: { name: "", email: "" },
    onSuccess: () => setOpen(false)
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Add forwarder
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a forwarder</DialogTitle>
          <DialogDescription>A freight forwarder your POs can ship to.</DialogDescription>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label="Add forwarder" dialog>
          <FormInput
            name="name"
            required
            label="Company"
            placeholder="Shenzhen Logistics"
            autoComplete="organization"
          />
          <FormInput
            name="email"
            label="Email"
            type="email"
            placeholder="ops@forwarder.example"
            autoComplete="email"
            description="Add one to invite them now."
          />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}

const inviteSchema = z.object({ email: z.email().max(254) })

// Invites a forwarder to keep its own addresses in Copacker.
export function InviteForwarder({ id, name, email }: { id: string; name: string; email: string | null }) {
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema: inviteSchema,
    action: "forwarder.invite",
    defaultValues: { email: email ?? "" },
    toPayload: (values) => ({ id, ...values }),
    onSuccess: () => setOpen(false)
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Invite ${name}`} />}>
        <Send data-icon="inline-start" />
        Invite
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite {name}</DialogTitle>
          <DialogDescription>They’ll keep their own warehouse addresses for your POs.</DialogDescription>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label="Send invitation" dialog>
          <FormInput name="email" required label="Email" type="email" autoComplete="email" />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}

const renameSchema = z.object({ name: z.string().trim().min(2).max(120) })

export function RenameForwarder({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema: renameSchema,
    action: "forwarder.rename",
    defaultValues: { name },
    toPayload: (values) => ({ id, ...values }),
    onSuccess: () => setOpen(false),
    keepSaved: true
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Edit ${name}`} />}>
        <Pencil data-icon="inline-start" />
        Edit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit forwarder</DialogTitle>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label="Save" dialog>
          <FormInput name="name" required label="Company" autoComplete="organization" />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}

export function RemoveForwarder({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function remove() {
    setPending(true)
    setError("")
    try {
      await run({ action: "forwarder.remove", data: { id } }).unwrap()
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(errorMessage(e, `Couldn’t remove ${name}`))
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Remove</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            New POs can’t ship to them. POs already sent keep their address.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={remove}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const addressFormSchema = z.object({ name: z.string().trim().min(1).max(100), address: addressSchema })

// Adds or edits one of a forwarder's addresses, for a forwarder that hasn't joined.
export function ForwarderAddress({
  forwarderId,
  forwarderName,
  contact
}: {
  forwarderId: string
  forwarderName: string
  contact?: { id: string; name: string; address: Address }
}) {
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema: addressFormSchema,
    action: "forwarder.address",
    defaultValues: contact ? { name: contact.name, address: contact.address } : { name: "", address: emptyAddress },
    toPayload: (values) => ({ ...values, forwarderId, ...(contact && { id: contact.id }) }),
    onSuccess: () => setOpen(false),
    keepSaved: Boolean(contact)
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={contact ? "ghost" : "outline"}
            size="sm"
            aria-label={contact ? `Edit ${contact.name}` : `Add an address for ${forwarderName}`}
          />
        }
      >
        {contact ? <Pencil /> : <MapPinPlus data-icon="inline-start" />}
        {!contact && "Add address"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit address" : `Add an address for ${forwarderName}`}</DialogTitle>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label={contact ? "Save changes" : "Save address"} dialog>
          <FormInput name="name" required label="Address name" placeholder="Yiwu warehouse" />
          <AddressFields path="address" />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
