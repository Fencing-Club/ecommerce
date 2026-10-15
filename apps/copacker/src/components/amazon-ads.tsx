"use client"

import { ArrowRight, CircleCheck, CircleDashed, Unplug, Wallet } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { StatusBadge } from "./common"
import { IntegrationCard } from "./integration-card"
import { IntegrationPanel, IntegrationPanelFooter, IntegrationSection } from "./integration-panel"
import { IntegrationSyncCard, type IntegrationSyncState } from "./integration-sync-card"
import { SyncProgress } from "./sync-status"
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
} from "./ui/alert-dialog"
import { Button, buttonVariants } from "./ui/button"
import { Dialog, DialogTrigger } from "./ui/dialog"

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
  account
}: {
  admin: boolean
  available: boolean
  sellerConnected: boolean
  account?: string
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
  const canManage = admin && sellerConnected && available && data && !isError
  let detail: React.ReactNode = null
  if (!sellerConnected) {
    detail = <p className="text-xs text-muted-foreground">{t("requiresStore")}</p>
  } else if (!available) {
    detail = <p className="text-xs text-muted-foreground">{t("unavailable")}</p>
  } else if (data?.connected) {
    detail = (
      <>
        {account && (
          <p className="truncate font-medium" title={account}>
            {account}
          </p>
        )}
        <div className="text-xs text-muted-foreground" aria-live="polite">
          <AdsSyncStatus active={data.active} failed={data.failed} />
        </div>
      </>
    )
  }
  const card = (
    <IntegrationCard
      store="amazon"
      title={t("title")}
      description={t("description")}
      status={badge}
      action={
        canManage &&
        (data.connected ? (
          <DialogTrigger render={<Button variant="outline" className="h-11 sm:h-[34px]" />}>
            {integrations("manage")}
            <span className="sr-only"> {t("title")}</span>
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </DialogTrigger>
        ) : (
          <a
            href="/api/connections/amazon-ads"
            className={cn(buttonVariants({ variant: "outline", className: "h-11 sm:h-[34px]" }))}
          >
            {integrations("connect")}
            <span className="sr-only"> {t("title")}</span>
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </a>
        ))
      }
    >
      {detail}
    </IntegrationCard>
  )
  if (!canManage || !data.connected) {
    return card
  }
  return (
    <Dialog>
      {card}
      <IntegrationPanel store="amazon" title={t("title")} account={account ?? t("summary")}>
        <AmazonAdsSettings available={available} />
      </IntegrationPanel>
    </Dialog>
  )
}

function AdsSyncStatus({ active, failed }: { active: boolean; failed: boolean }) {
  const t = useTranslations("settings.amazonAds")
  if (active) {
    return <SyncProgress>{t("syncing")}</SyncProgress>
  }
  if (failed) {
    return <span className="text-destructive">{t("failed")}</span>
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <CircleCheck className="size-3.5 text-success" aria-hidden />
      {t("ready")}
    </span>
  )
}

export function AmazonAdsSettings({ available }: { available: boolean }) {
  const t = useTranslations("settings.amazonAds")
  const common = useTranslations("common.disconnect")
  const panel = useTranslations("settings.integrations.panel")
  const syncCopy = useTranslations("common.sync")
  const status = adsApi.useAmazonAdsStatusQuery(undefined, { skip: !available, pollingInterval: 10000 })
  const [run, action] = adsApi.useAmazonAdsActionMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  let syncState: IntegrationSyncState = "scheduled"
  if (status.data?.active) {
    syncState = "syncing"
  } else if (status.data?.failed) {
    syncState = "failed"
  }
  async function change(value: "sync" | "disconnect") {
    try {
      await run(value).unwrap()
      setConfirmOpen(false)
      await status.refetch()
    } catch {
      /* The mutation error is shown below. */
    }
  }
  return (
    <section className="flex min-h-0 flex-col" aria-label={t("title")}>
      <div className="min-h-0 space-y-5 overflow-y-auto bg-muted/20 p-5 sm:p-6">
        {!available ? (
          <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
        ) : (
          <>
            {(status.isError || action.isError) && (
              <p role="alert" className="text-sm text-destructive">
                {t("error")}
              </p>
            )}
            {!status.data && !status.isError && <p className="text-sm text-muted-foreground">{t("checking")}</p>}
            {status.data &&
              (status.data.connected ? (
                <IntegrationSection title={panel("syncTitle")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <IntegrationSyncCard
                      title={t("spendTitle")}
                      label={t("spendTitle")}
                      icon={<Wallet />}
                      status={syncState}
                      detail={status.data.failed ? t("failed") : t("description")}
                      onSync={() => void change("sync")}
                      disabled={action.isLoading || status.data.active}
                      actionLabel={t("sync")}
                    />
                  </div>
                </IntegrationSection>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{t("description")}</p>
                  <a
                    href="/api/connections/amazon-ads"
                    className={cn(buttonVariants({ variant: "outline", className: "h-11 sm:h-[34px]" }))}
                  >
                    {t("connect")}
                  </a>
                </div>
              ))}
          </>
        )}
      </div>
      {available && status.data?.connected && (
        <IntegrationPanelFooter>
          <a
            href="/api/connections/amazon-ads"
            aria-label={t("reconnect")}
            className={cn(buttonVariants({ variant: "ghost", className: "h-11 text-muted-foreground sm:h-[34px]" }))}
          >
            {syncCopy("reconnect")}
          </a>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  className="h-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-[34px]"
                  disabled={action.isLoading}
                  aria-label={t("disconnect")}
                />
              }
            >
              <Unplug className="size-4" aria-hidden />
              {common("disconnect")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("disconnectTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("disconnectDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              {action.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {t("error")}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={action.isLoading}>{common("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={action.isLoading}
                  onClick={() => void change("disconnect")}
                >
                  {t("disconnect")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </IntegrationPanelFooter>
      )}
    </section>
  )
}
