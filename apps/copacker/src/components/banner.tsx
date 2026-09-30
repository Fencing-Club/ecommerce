"use client"

import { useLocalStorage } from "@mantine/hooks"
import { CircleAlert, Info, TriangleAlert, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

type BannerTone = "warning" | "info" | "destructive"

const tones = {
  warning: {
    icon: TriangleAlert,
    frame: "border-warning-border bg-warning/15 text-warning-foreground",
    action: "[&_[data-slot=button]]:border-warning-border"
  },
  info: {
    icon: Info,
    frame: "border-info-border bg-info-tint text-info",
    action: "[&_[data-slot=button]]:border-info-border"
  },
  destructive: {
    icon: CircleAlert,
    frame: "border-destructive-border bg-destructive-tint text-destructive",
    action: "[&_[data-slot=button]]:border-destructive-border"
  }
} satisfies Record<BannerTone, { icon: React.ElementType; frame: string; action: string }>

// The page's one notice, above its content: a line about what happened, the action that deals with it, and a dismiss
// button. Dismissing hides it for this person until `dismissKey` changes, so a key names the state it's about (a store
// and when it disconnected). Without a key the banner can't be dismissed, which only a blocking error may do, and then it
// must carry the action that fixes it.
export function Banner({
  tone,
  action,
  dismissKey,
  className,
  children
}: {
  tone: BannerTone
  action?: React.ReactNode
  dismissKey?: string
  className?: string
  children: React.ReactNode
}) {
  const t = useTranslations("common.banner")
  // Read after the first render, so the server's HTML and the browser's first render agree.
  const [dismissed, setDismissed] = useLocalStorage({
    key: `copacker.banner.${dismissKey ?? ""}`,
    defaultValue: false
  })
  if (dismissKey && dismissed) {
    return null
  }
  const { icon: Icon, frame, action: actionBorder } = tones[tone]
  return (
    <div
      data-slot="banner"
      data-tone={tone}
      className={cn("flex min-h-12 items-center gap-2.5 rounded-lg border py-2 ps-3.5 pe-2 text-sm", frame, className)}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 font-medium">{children}</p>
      {action && (
        <div
          className={cn(
            "shrink-0 [&_[data-slot=button]]:h-7 [&_[data-slot=button]]:bg-background [&_[data-slot=button]]:font-semibold [&_[data-slot=button]]:text-foreground",
            actionBorder
          )}
        >
          {action}
        </div>
      )}
      {dismissKey && (
        <button
          type="button"
          aria-label={t("dismiss")}
          onClick={() => setDismissed(true)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md outline-none hover:bg-current/10 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
