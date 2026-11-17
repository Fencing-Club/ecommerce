import { AlertDialogTrigger, Button, DialogTrigger } from "@buildkitgg/shadcn"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { inviteSchema, newPartnerSchema } from "@/lib/partners"
import { FormInput } from "./form-controls"
import { FormDialog } from "./form-dialog"

// Invites a forwarder to keep its own addresses in Copacker. Opened from the forwarder's menu.
export function InviteForwarder({
  id,
  name,
  email,
  open,
  onOpenChange
}: {
  id: string
  name: string
  email: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("partners.forwarder.invite")
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name })}
      description={t("description")}
      submitLabel={t("submit")}
      form={{
        schema: inviteSchema,
        action: "forwarder.invite",
        defaultValues: { email: email ?? "" },
        toPayload: (values) => ({ id, ...values })
      }}
    >
      <FormInput name="email" required label={t("email")} type="email" autoComplete="off" />
    </FormDialog>
  )
}

const renameSchema = newPartnerSchema.pick({ name: true })

export function RenameForwarder({ id, name }: { id: string; name: string }) {
  const t = useTranslations("partners.forwarder.rename")
  return (
    <FormDialog
      trigger={
        <DialogTrigger render={<Button variant="outline" size="sm" aria-label={t("triggerLabel", { name })} />}>
          <Pencil data-icon="inline-start" />
          {t("trigger")}
        </DialogTrigger>
      }
      title={t("title")}
      submitLabel={t("submit")}
      form={{
        schema: renameSchema,
        action: "forwarder.rename",
        defaultValues: { name },
        toPayload: (values) => ({ id, ...values })
      }}
    >
      <FormInput name="name" required label={t("company")} autoComplete="off" />
    </FormDialog>
  )
}

export function RemoveForwarder({ id, name }: { id: string; name: string }) {
  const t = useTranslations("partners.forwarder.remove")
  const [open, setOpen] = useState(false)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>{t("trigger")}</AlertDialogTrigger>}
      title={t("title", { name })}
      description={t("description")}
      confirmLabel={t("confirm")}
      tone="destructive"
      action="forwarder.remove"
      data={{ id }}
      fallback={t("failed", { name })}
    />
  )
}
