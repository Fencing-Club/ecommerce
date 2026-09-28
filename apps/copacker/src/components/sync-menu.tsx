"use client"

import { Ellipsis } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

// A store's sync in its settings: Sync now, and Reconnect when signing in again would fix a failed sync. Syncs run on
// their own (webhooks, and every account again each night), so this is only for catching up at once.
export function SyncMenu({
  label,
  syncing,
  onSync,
  reconnect
}: {
  label: string
  syncing: boolean
  onSync: () => void
  // Where signing in again starts, when that's what the last sync needs.
  reconnect?: string | null
}) {
  const t = useTranslations("common.sync")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("actions", { label })} />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={syncing} onClick={onSync}>
          {syncing ? t("syncing") : t("syncNow")}
        </DropdownMenuItem>
        {reconnect && <DropdownMenuItem render={<a href={reconnect}>{t("reconnect")}</a>} />}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// When a sync last finished, as "Synced Sep 27, 12:00 AM", with the full date on hover.
export function SyncedAt({ at }: { at: string }) {
  const t = useTranslations("common.sync")
  const locale = useLocale()
  return t.rich("synced", {
    time: () => (
      <time dateTime={at} title={new Date(at).toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}>
        {new Date(at).toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </time>
    )
  })
}

// A running sync, with how much of the order history is copied when that's known.
export function SyncProgress({ progress, children }: { progress?: number | null; children?: React.ReactNode }) {
  const t = useTranslations("common.sync")
  return (
    <span className="inline-flex items-center gap-1.5">
      <Spinner className="size-3.5 shrink-0" />
      {children ?? (typeof progress === "number" ? t("syncingProgress", { progress }) : t("syncing"))}
    </span>
  )
}
