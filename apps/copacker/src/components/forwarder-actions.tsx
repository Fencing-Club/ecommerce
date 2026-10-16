"use client"

import { Pencil } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { FormError } from "@/components/form-feedback"
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
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionForm } from "@/hooks/useActionForm"
import { useActionMutation } from "@/lib/api"
import { ActionForm } from "./action-form"
import { FormInput } from "./form-controls"

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
  const t = useTranslations("partners.forwarder.invite")
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
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label={t("submit")} dialog>
          <FormInput name="email" required label={t("email")} type="email" autoComplete="off" />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}

const renameSchema = z.object({ name: z.string().trim().min(2).max(120) })

export function RenameForwarder({ id, name }: { id: string; name: string }) {
  const t = useTranslations("partners.forwarder.rename")
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
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label={t("triggerLabel", { name })} />}>
        <Pencil data-icon="inline-start" />
        {t("trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label={t("submit")} dialog>
          <FormInput name="name" required label={t("company")} autoComplete="off" />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}

export function RemoveForwarder({ id, name }: { id: string; name: string }) {
  const t = useTranslations("partners.forwarder.remove")
  const errorMessage = useErrorMessage()
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
      setError(errorMessage(e, t("failed", { name })))
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>{t("trigger")}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={remove}>
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
