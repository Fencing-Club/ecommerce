import { useId, useState } from "react"
import { useLocale, useTranslations } from "use-intl"
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
import { Field } from "@/components/ui/field"
import { useActionForm } from "@/hooks/useActionForm"
import { selfAuthorizationSchema } from "@/lib/amazon"
import { amazonMarketplaces } from "@/lib/amazon-marketplaces"
import { countriesIn } from "@/lib/countries"
import { ActionForm } from "./action-form"
import { FormInput, FormLabel } from "./form-controls"
import { FormSelect, SelectControl } from "./form-select"

export function AmazonConnect({
  className,
  children,
  selfAuth = false,
  embedded = false,
  onConnected
}: {
  className?: string
  children?: React.ReactNode
  selfAuth?: boolean
  embedded?: boolean
  onConnected?: () => void
}) {
  const t = useTranslations("settings.integrations.amazonConnect")
  const privateText = useTranslations("settings.integrations.amazonSelfAuthorize")
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema: selfAuthorizationSchema,
    action: "connection.amazonSelfAuthorized",
    defaultValues: { marketplace: "US", refreshToken: "" },
    onSuccess: () => {
      setOpen(false)
      onConnected?.()
    }
  })
  const id = useId()
  const [marketplace, setMarketplace] = useState("US")
  const countries = countriesIn(useLocale())
  const options = amazonMarketplaces.map((value) => ({
    value,
    label: countries.find((country) => country.value === value)?.label ?? value
  }))
  const content = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{selfAuth ? privateText("description") : t("description")}</DialogDescription>
      </DialogHeader>
      {selfAuth ? (
        <ActionForm form={form} onSubmit={submit} label={privateText("connect")} dialog>
          <FormSelect name="marketplace" label={t("marketplace")} options={options} required />
          <FormInput
            name="refreshToken"
            label={privateText("refreshToken")}
            type="password"
            autoComplete="off"
            required
          />
        </ActionForm>
      ) : (
        <form method="get" action="/api/connections/amazon" className="grid gap-5">
          <Field>
            <FormLabel htmlFor={id} label={t("marketplace")} required />
            <SelectControl
              id={id}
              name="marketplace"
              options={options}
              value={marketplace}
              onValueChange={(value) => setMarketplace(value ?? "US")}
              required
            />
          </Field>
          <DialogFooter>
            <Button type="submit">{t("continue")}</Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  )
  return embedded ? (
    content
  ) : (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={className}>{children}</DialogTrigger>
      {content}
    </Dialog>
  )
}
