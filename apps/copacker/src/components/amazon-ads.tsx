"use client"

import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react"
import { useTranslations } from "next-intl"
import { match } from "ts-pattern"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { StatusBadge } from "./common"
import { StoreLogo } from "./store-logos"
import { Button, buttonVariants } from "./ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "./ui/sheet"

const adsApi = api.injectEndpoints({
  endpoints: (build) => ({
    amazonAdsStatus: build.query<{ connected: boolean; active: boolean; failed: boolean }, void>({
      query: () => "connections/amazon-ads?status=1"
    }),
    amazonAdsAction: build.mutation<{ ok: boolean }, "sync" | "disconnect">({
      query: (action) => ({ url: "connections/amazon-ads", method: "POST", body: { action } })
    })
  })
})

export function AmazonAdsCard({
  admin,
  available,
  sellerConnected,
  className
}: {
  admin: boolean
  available: boolean
  sellerConnected: boolean
  className: string
}) {
  const t = useTranslations("settings.amazonAds")
  const integrations = useTranslations("settings.integrations")
  const { data, isError } = adsApi.useAmazonAdsStatusQuery(undefined, { pollingInterval: 10000 })
  let badge = <span className="text-xs text-muted-foreground">{t("checking")}</span>
  if (isError) {
    badge = <span className="text-xs text-muted-foreground">{t("statusUnavailable")}</span>
  } else if (data) {
    badge = (
      <StatusBadge
        tone={data.connected ? "success" : "neutral"}
        icon={data.connected ? <CircleCheck aria-hidden /> : <CircleDashed aria-hidden />}
      >
        {t(data.connected ? "connected" : "notConnected")}
      </StatusBadge>
    )
  }
  const clickable = cn(
    className,
    "cursor-pointer transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
  )
  let footer: React.ReactNode = null
  if (!sellerConnected) {
    footer = <span className="text-sm text-muted-foreground">{t("requiresStore")}</span>
  } else if (!available) {
    footer = <span className="text-sm text-muted-foreground">{t("unavailable")}</span>
  } else if (admin && data && !isError) {
    footer = (
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium">
        {integrations(data.connected ? "manage" : "connect")}
        <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
      </span>
    )
  }
  const body = (
    <>
      <span className="flex w-full items-start justify-between gap-3">
        <StoreLogo store="amazon" />
        <span aria-live="polite">{badge}</span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-medium">{t("title")}</span>
        <span className="text-sm text-muted-foreground">{t("summary")}</span>
      </span>
      {footer}
    </>
  )
  if (!admin || !sellerConnected || !available || !data || isError) {
    return <div className={className}>{body}</div>
  }
  if (!data.connected) {
    return (
      <a className={clickable} href="/api/connections/amazon-ads" aria-label={t("connect")}>
        {body}
      </a>
    )
  }
  return (
    <Sheet>
      <SheetTrigger className={clickable} aria-label={integrations("storeSettings", { store: t("title") })}>
        {body}
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="flex-row items-center gap-3 border-b">
          <StoreLogo store="amazon" />
          <div className="flex flex-col gap-0.5">
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("summary")}</SheetDescription>
          </div>
        </SheetHeader>
        <div className="overflow-y-auto px-4">
          <AmazonAdsSettings available={available} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function AmazonAdsSettings({ available }: { available: boolean }) {
  const t = useTranslations("settings.amazonAds")
  const status = adsApi.useAmazonAdsStatusQuery(undefined, { skip: !available, pollingInterval: 10000 })
  const [run, action] = adsApi.useAmazonAdsActionMutation()
  async function change(value: "sync" | "disconnect") {
    try {
      await run(value).unwrap()
      await status.refetch()
    } catch {
      /* The mutation error is shown below. */
    }
  }
  return (
    <section className="grid gap-3 py-4" aria-label={t("title")}>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {!available ? (
        <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
      ) : (
        <>
          {(status.isError || action.isError) && (
            <p role="alert" className="text-sm text-destructive">
              {t("error")}
            </p>
          )}
          {status.data && (
            <>
              <p className="text-sm" aria-live="polite">
                {t(
                  match(status.data)
                    .with({ active: true }, () => "syncing" as const)
                    .with({ failed: true }, () => "failed" as const)
                    .with({ connected: true }, () => "connected" as const)
                    .otherwise(() => "notConnected" as const)
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <a className={buttonVariants({ variant: "outline" })} href="/api/connections/amazon-ads">
                  {t(status.data.connected ? "reconnect" : "connect")}
                </a>
                {status.data.connected && (
                  <>
                    <Button
                      variant="outline"
                      disabled={action.isLoading || status.data.active}
                      onClick={() => void change("sync")}
                    >
                      {t("sync")}
                    </Button>
                    <Button variant="ghost" disabled={action.isLoading} onClick={() => void change("disconnect")}>
                      {t("disconnect")}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
