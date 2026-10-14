"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { useActionForm } from "@/hooks/useActionForm"
import { selfAuthorizationSchema } from "@/lib/amazon"
import { ActionForm } from "./actions"
import { FormInput } from "./form-controls"

// Private authorization is available only when enabled by the server configuration.
export function AmazonSelfAuthorize({ className, children }: { className?: string; children: React.ReactNode }) {
  const t = useTranslations("settings.integrations.amazonSelfAuthorize")
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema: selfAuthorizationSchema,
    action: "connection.amazonSelfAuthorized",
    defaultValues: { sellerId: "", refreshToken: "" },
    onSuccess: () => setOpen(false)
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={className}>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label={t("connect")} dialog>
          <FormInput
            name="sellerId"
            required
            label={t("merchantToken")}
            placeholder="A2CIYIV0E1FHU3"
            autoComplete="off"
          />
          <FormInput
            name="refreshToken"
            required
            label={t("refreshToken")}
            type="password"
            placeholder="Atzr|…"
            autoComplete="off"
          />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
