"use client"

import { useTranslations } from "next-intl"
import { match } from "ts-pattern"
import { api } from "@/lib/api"
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
