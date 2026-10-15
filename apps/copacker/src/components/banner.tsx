"use client"

import { useLocalStorage } from "@mantine/hooks"
import { CircleAlert, Info, TriangleAlert, X } from "lucide-react"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"

type BannerTone = "warning" | "info" | "destructive"

// Each tone's surface and text, and the border its action takes.
const tones = {
  warning: {
    icon: TriangleAlert,
    frame: "border-warning-border bg-warning-soft text-warning-foreground",
    action: "border-warning-border"
  },
  info: { icon: Info, frame: "border-info-soft bg-info-soft text-info", action: "border-info-soft" },
  destructive: {
    icon: CircleAlert,
    frame: "border-destructive-border bg-destructive-soft text-destructive",
    action: "border-destructive-border"
  }
} satisfies Record<BannerTone, { icon: React.ElementType; frame: string; action: string }>

// The page's one notice, above its content: a line about what happened, the action that deals with it, and a dismiss
// button. Dismissing hides it for this person until `dismissKey` changes, so a key names the state it's about (a store
// and when it disconnected). Without a key the banner can't be dismissed, which only a blocking error may do, and then it
// must carry the action that fixes it. `action` is the label of the action, and `onAction` or `href` does it.
export function Banner({
  tone,
  action,
  onAction,
  href,
  dismissKey,
  className,
  children
}: {
  tone: BannerTone
  action?: string
  onAction?: () => void
  href?: string
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
  const actionClass = cn(
    "inline-flex h-7 shrink-0 items-center rounded-md border bg-background px-2.5 text-[13px] font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
    actionBorder
  )
  return (
    <div
      data-slot="banner"
      data-tone={tone}
      className={cn("flex items-center gap-2.5 rounded-lg border py-2.5 ps-3.5 pe-2", frame, className)}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] font-medium">{children}</p>
      {action &&
        (href ? (
          <a href={href} className={actionClass}>
            {action}
          </a>
        ) : (
          <button type="button" onClick={onAction} className={actionClass}>
            {action}
          </button>
        ))}
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
