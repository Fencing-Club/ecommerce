import { amazonMarketplaceSchema } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { countriesIn } from "@repo/copacker-shipments/countries"
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
import { useActionForm } from "@/hooks/use-action-form"
import { selfAuthorizationSchema } from "@/lib/amazon"
import { ActionForm } from "./action-form"
import { FormInput } from "./form-controls"
import { SelectField } from "./form-fields"
import { FormSelect } from "./form-select"

// Connects an Amazon seller account: through Amazon's consent page, or for a private app, with its refresh token.
// `embedded` renders only the dialog's content, for a dialog its parent opens.
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
  const content = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{selfAuth ? privateText("description") : t("description")}</DialogDescription>
      </DialogHeader>
      {/* Mounted only while the dialog is open, so each opening starts without the last one's token. */}
      {selfAuth ? (
        <SelfAuthorizeForm
          onConnected={() => {
            setOpen(false)
            onConnected?.()
          }}
        />
      ) : (
        <ConsentForm />
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

function useMarketplaceOptions() {
  const countries = countriesIn(useLocale())
  return amazonMarketplaceSchema.options.map((value) => ({
    value,
    label: countries.find((country) => country.value === value)?.label ?? value
  }))
}

// A private app's refresh token, saved as the connection.
function SelfAuthorizeForm({ onConnected }: { onConnected: () => void }) {
  const t = useTranslations("settings.integrations.amazonConnect")
  const privateText = useTranslations("settings.integrations.amazonSelfAuthorize")
  const options = useMarketplaceOptions()
  const { form, submit } = useActionForm({
    schema: selfAuthorizationSchema,
    action: "connection.amazonSelfAuthorized",
    defaultValues: { marketplace: "US", refreshToken: "" },
    onSuccess: onConnected
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={privateText("connect")} layout="dialog">
      <FormSelect name="marketplace" label={t("marketplace")} options={options} required />
      <FormInput name="refreshToken" label={privateText("refreshToken")} type="password" autoComplete="off" required />
    </ActionForm>
  )
}

// The marketplace, sent with the browser to Amazon's consent page.
function ConsentForm() {
  const t = useTranslations("settings.integrations.amazonConnect")
  const id = useId()
  const options = useMarketplaceOptions()
  return (
    <form method="get" action="/api/connections/amazon" className="grid gap-5">
      <SelectField id={id} name="marketplace" label={t("marketplace")} options={options} defaultValue="US" required />
      <DialogFooter>
        <Button type="submit">{t("continue")}</Button>
      </DialogFooter>
    </form>
  )
}
