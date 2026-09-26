"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Clock, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, useActionMutation } from "@/lib/api"
import { formErrorMap } from "@/lib/form-errors"
import { FormError } from "./actions"
import { FormNumber } from "./form-controls"
import { SupplierForm } from "./settings-forms"
import { sx } from "@/styles/sprinkles.css"

export function InviteSupplier() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Invite supplier
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a supplier</DialogTitle>
          <DialogDescription>They get their own workspace for your POs, cartons, and labels.</DialogDescription>
        </DialogHeader>
        <SupplierForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export function RemoveSupplier({ id, name, joined }: { id: string; name: string; joined: boolean }) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function remove() {
    setPending(true)
    setError("")
    try {
      await run({ action: "supplier.remove", data: { id } }).unwrap()
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
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Remove ${name}`} />}>
        Remove
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {joined
              ? "They’ll no longer see your POs, and you can’t send them new ones."
              : "Their invitation stops working, and you can’t send them new POs."}{" "}
            Your existing POs keep their details. You can invite them again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} aria-busy={pending} onClick={remove}>
            {pending && <Spinner data-icon="inline-start" />}
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const leadTimeSchema = z.object({
  leadTimeDays: z.number().int().min(1).max(730).optional(),
  amazonLeadTimeDays: z.number().int().min(1).max(730).optional()
})

// Days from ordering until stock arrives, which restock uses for this supplier's products.
export function SupplierLeadTimes({
  id,
  name,
  leadTimeDays,
  amazonLeadTimeDays
}: {
  id: string
  name: string
  leadTimeDays: number | null
  amazonLeadTimeDays: number | null
}) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [open, setOpen] = useState(false)
  const form = useForm<z.input<typeof leadTimeSchema>, unknown, z.output<typeof leadTimeSchema>>({
    resolver: zodResolver(leadTimeSchema, { error: formErrorMap }),
    values: { leadTimeDays: leadTimeDays ?? undefined, amazonLeadTimeDays: amazonLeadTimeDays ?? undefined }
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      await run({
        action: "supplier.leadTimes",
        data: { id, leadTimeDays: values.leadTimeDays ?? null, amazonLeadTimeDays: values.amazonLeadTimeDays ?? null }
      }).unwrap()
      setOpen(false)
      router.refresh()
    } catch (error) {
      form.setError("root.server", { message: errorMessage(error, "Couldn’t save the lead times. Try again.") })
    }
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Lead times for ${name}`} />}>
        <Clock data-icon="inline-start" />
        Lead times
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
            <DialogHeader>
              <DialogTitle>Lead times for {name}</DialogTitle>
              <DialogDescription>
                Days from sending a PO until the stock can be sold. Restock orders enough to last this long. Leave a
                field empty to use the lead time on the Restock page.
              </DialogDescription>
            </DialogHeader>
            <FormNumber name="leadTimeDays" label="To your locations (days)" min={1} max={730} step={1} />
            <FormNumber
              name="amazonLeadTimeDays"
              label="To Amazon (days)"
              description="Include Amazon’s receiving time. Empty uses the lead time to your locations."
              min={1}
              max={730}
              step={1}
            />
            <FormError message={form.formState.errors.root?.server?.message} />
            <DialogFooter>
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
