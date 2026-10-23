import { AlertDialogTrigger, Button } from "@buildkitgg/shadcn-baseui-kit"
import { Unplug } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { touchButton, ghostDestructive } from "@/lib/controls"
import { storeNames, type Store } from "@/lib/stores"
import { cn } from "@/lib/utils"

// A quiet, red Disconnect that asks first.
export function DisconnectButton({ provider, account }: { provider: Store; account: string }) {
  const t = useTranslations("common.disconnect")
  const [open, setOpen] = useState(false)
  const name = storeNames[provider]

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <AlertDialogTrigger render={<Button variant="ghost" className={cn(touchButton, ghostDestructive)} />}>
          <Unplug className="size-4" aria-hidden />
          {t("disconnect")}
        </AlertDialogTrigger>
      }
      title={t("title", { name })}
      // What stops when each account is disconnected.
      description={t(`${provider}Effect`, { account })}
      confirmLabel={t("disconnect")}
      tone="destructive"
      action="connection.delete"
      data={{ provider }}
      fallback={t("failed", { name })}
    />
  )
}
