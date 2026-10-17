import { Plus } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { useSubmissionForm } from "@/hooks/use-submission-form"
import { useActionMutation } from "@/lib/api"
import { ActionForm } from "./action-form"
import { FormInput } from "./form-controls"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"

const addSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(254), z.literal("")])
})

// Adds a freight forwarder. With an email, it's invited to join and keep its own addresses.
export function AddForwarder({
  open: shown,
  onOpenChange,
  onCreated
}: {
  onCreated: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("partners.forwarder.add")
  const [own, setOwn] = useState(false)
  const open = shown ?? own
  const setOpen = onOpenChange ?? setOwn
  const [run] = useActionMutation()
  const { form, submit } = useSubmissionForm({
    schema: addSchema,
    run: (data) => run({ action: "forwarder.create", data }).unwrap(),
    defaultValues: { name: "", email: "" },
    onSuccess: () => {
      setOpen(false)
      onCreated()
    }
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {shown === undefined && (
        <DialogTrigger render={<Button />}>
          <Plus data-icon="inline-start" />
          {t("trigger")}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label={t("submit")} dialog>
          <FormInput
            name="name"
            required
            label={t("company")}
            placeholder={t("companyPlaceholder")}
            autoComplete="off"
          />
          <FormInput
            name="email"
            label={t("email")}
            type="email"
            placeholder="ops@forwarder.example"
            autoComplete="off"
            description={t("emailDescription")}
          />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
