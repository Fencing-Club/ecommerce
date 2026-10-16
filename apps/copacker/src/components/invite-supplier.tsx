"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { SupplierForm } from "./supplier-form"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"

export function InviteSupplier({
  open: shown,
  onOpenChange,
  finalFocus,
  onCreated
}: {
  onCreated: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  finalFocus?: React.RefObject<HTMLElement | null>
}) {
  const t = useTranslations("partners.supplier.add")
  const [own, setOwn] = useState(false)
  const open = shown ?? own
  const setOpen = onOpenChange ?? setOwn
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {shown === undefined && (
        <DialogTrigger render={<Button />}>
          <Plus data-icon="inline-start" />
          {t("trigger")}
        </DialogTrigger>
      )}
      <DialogContent finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <SupplierForm
          onSuccess={() => {
            setOpen(false)
            onCreated()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
