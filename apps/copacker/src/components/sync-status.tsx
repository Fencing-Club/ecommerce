"use client"

import { useLocale, useTranslations } from "next-intl"
import { Spinner } from "@/components/ui/spinner"

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
