"use client"

import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react"
import { useTranslations } from "next-intl"
import { match } from "ts-pattern"
import { api } from "@/lib/api"
import { StatusBadge } from "./common"
import { Button } from "./ui/button"

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

export function AmazonAdsIndicator({ admin }: { admin: boolean }) {
  const t = useTranslations("settings.amazonAds")
  const { data, isError } = adsApi.useAmazonAdsStatusQuery(undefined, { pollingInterval: 10000 })
  let badge = <span className="text-xs text-muted-foreground">{t("checking")}</span>
  if (isError) {
    badge = <span className="text-xs text-muted-foreground">{t("statusUnavailable")}</span>
  } else if (data) {
    badge = (
      <span className="inline-flex items-center gap-1">
        <StatusBadge
          tone={data.connected ? "success" : "neutral"}
          icon={data.connected ? <CircleCheck aria-hidden /> : <CircleDashed aria-hidden />}
        >
          {t(data.connected ? "connected" : "notConnected")}
        </StatusBadge>
        {admin && !data.connected && <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />}
      </span>
    )
  }
  return (
    <span className="flex w-full flex-wrap items-center justify-between gap-2 border-t pt-2" aria-live="polite">
      <span>{t("title")}</span>
      {badge}
    </span>
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
      <h3 className="text-sm font-medium">{t("title")}</h3>
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
                <Button
                  variant="outline"
                  render={
                    <a
                      href="/api/connections/amazon-ads"
                      aria-label={t(status.data.connected ? "reconnect" : "connect")}
                    />
                  }
                >
                  {t(status.data.connected ? "reconnect" : "connect")}
                </Button>
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
