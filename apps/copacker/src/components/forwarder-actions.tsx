"use client"

import { Pencil, Plus } from "lucide-react"
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
import { FormInput } from "./form-controls"

const addSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(254), z.literal("")])
})

// Adds a freight forwarder. With an email, it's invited to join and keep its own addresses.
export function AddForwarder({
  open: shown,
  onOpenChange
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [own, setOwn] = useState(false)
  const open = shown ?? own
  const setOpen = onOpenChange ?? setOwn
  const { form, submit } = useActionForm({
    schema: addSchema,
    action: "forwarder.create",
    defaultValues: { name: "", email: "" },
    onSuccess: () => setOpen(false)
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {shown === undefined && (
        <DialogTrigger render={<Button />}>
          <Plus data-icon="inline-start" />
          Add forwarder
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a forwarder</DialogTitle>
          <DialogDescription>A freight forwarder your purchase orders can ship to.</DialogDescription>
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

// Invites a forwarder to keep its own addresses in Copacker. Opened from the forwarder's menu.
export function InviteForwarder({
  id,
  name,
  email,
  open,
  onOpenChange: setOpen
}: {
  id: string
  name: string
  email: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { form, submit } = useActionForm({
    schema: inviteSchema,
    action: "forwarder.invite",
    defaultValues: { email: email ?? "" },
    toPayload: (values) => ({ id, ...values }),
    onSuccess: () => setOpen(false)
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
        <DialogHeader>
          <DialogTitle>Invite {name}</DialogTitle>
          <DialogDescription>They’ll keep their own warehouse addresses for your purchase orders.</DialogDescription>
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
            New purchase orders can’t ship to them. Purchase orders already sent keep their address.
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
