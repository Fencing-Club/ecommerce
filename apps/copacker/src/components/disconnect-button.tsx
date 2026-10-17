import { useRouter } from "@tanstack/react-router"
import { Unplug } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
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
import { Spinner } from "@/components/ui/spinner"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"

const names = { shopify: "Shopify", amazon: "Amazon", ebay: "eBay" }

// A quiet, red Disconnect that asks first.
export function DisconnectButton({ provider, account }: { provider: "shopify" | "amazon" | "ebay"; account: string }) {
  const t = useTranslations("common.disconnect")
  const router = useRouter()
  const [run] = useActionMutation()
  const errorMessage = useErrorMessage()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const name = names[provider]

  async function disconnect() {
    setPending(true)
    setError("")
    try {
      await run({ action: "connection.delete", data: { provider } }).unwrap()
      setOpen(false)
      router.invalidate()
    } catch (e) {
      setError(errorMessage(e, t("failed", { name })))
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            className="h-11 text-muted-foreground sm:h-[34px] hover:bg-destructive/10 hover:text-destructive aria-expanded:bg-destructive/10 aria-expanded:text-destructive dark:hover:bg-destructive/20"
          />
        }
      >
        <Unplug className="size-4" aria-hidden />
        {t("disconnect")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name })}</AlertDialogTitle>
          {/* What stops when each account is disconnected. */}
          <AlertDialogDescription>{t(`${provider}Effect`, { account })}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} aria-busy={pending} onClick={disconnect}>
            {pending && <Spinner data-icon="inline-start" />}
            {t("disconnect")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
