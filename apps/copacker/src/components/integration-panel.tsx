"use client"

import { CircleCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId, useRef } from "react"
import { StatusBadge } from "./common"
import { StoreLogo } from "./store-logos"
import { Button } from "./ui/button"
import { DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"

// Management stays close to the card and grows with its contents, rather than filling an empty drawer.
export function IntegrationPanel({
  store,
  title,
  account,
  domain,
  children
}: {
  store: "shopify" | "amazon" | "ebay"
  title: string
  account: string
  domain?: string
  children: React.ReactNode
}) {
  const t = useTranslations("settings.integrations")
  const titleRef = useRef<HTMLHeadingElement>(null)
  return (
    <DialogContent
      initialFocus={titleRef}
      className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px] [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:end-3 [&>[data-slot=dialog-close]]:size-11 sm:[&>[data-slot=dialog-close]]:size-[34px]"
    >
      <DialogHeader className="shrink-0 flex-row items-start gap-4 border-b p-5 pe-14 sm:p-6 sm:pe-14">
        <StoreLogo store={store} className="size-12 shrink-0 shadow-none" />
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <DialogTitle ref={titleRef} tabIndex={-1} className="text-xl leading-6 tracking-tight outline-none">
              {title}
            </DialogTitle>
            <StatusBadge tone="success" icon={<CircleCheck aria-hidden />}>
              {t("connected")}
            </StatusBadge>
          </div>
          <DialogDescription className="break-words text-foreground">{account}</DialogDescription>
          {domain && <p className="break-all text-xs text-muted-foreground">{domain}</p>}
        </div>
      </DialogHeader>
      {children}
    </DialogContent>
  )
}

export function IntegrationSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section className="space-y-3" aria-labelledby={id}>
      <h3 id={id} className="text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function IntegrationPanelFooter({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common.ui")
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-1">{children}</div>
      <DialogClose render={<Button variant="outline" className="hidden h-[34px] sm:inline-flex" />}>
        {t("close")}
      </DialogClose>
    </div>
  )
}
