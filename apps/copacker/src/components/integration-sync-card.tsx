import { Button, buttonVariants, Spinner } from "@buildkitgg/shadcn-baseui-kit"
import { CircleAlert, CircleCheck, Clock3, RefreshCw } from "lucide-react"
import { useId } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { touchButton } from "@/lib/controls"
import type { StatusTone } from "@/lib/tone"
import { cn } from "@/lib/utils"
import { StatusBadge } from "./common"

export type IntegrationSyncState =
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "idle"
  | "loading"
  | "unavailable"
  | "scheduled"
const tones: Record<IntegrationSyncState, StatusTone> = {
  queued: "info",
  syncing: "info",
  synced: "success",
  failed: "destructive",
  idle: "neutral",
  loading: "neutral",
  unavailable: "warning",
  scheduled: "success"
}

export function IntegrationSyncCard({
  title,
  label,
  icon,
  status,
  detail,
  progress,
  onSync,
  disabled,
  reconnect,
  actionLabel
}: {
  title: string
  label: string
  icon: React.ReactNode
  status: IntegrationSyncState
  detail?: React.ReactNode
  progress?: number | null
  onSync: () => void
  disabled?: boolean
  reconnect?: string | null
  actionLabel?: string
}) {
  const t = useTranslations("settings.integrations.panel")
  const common = useTranslations("common.sync")
  const format = useFormatter()
  const id = useId()
  const active = status === "syncing" || status === "queued" || status === "loading"
  const amount = typeof progress === "number" ? Math.min(1, Math.max(0, progress)) : null
  const showProgress = status === "syncing" && amount !== null
  let statusIcon: React.ReactNode
  if (status === "syncing" || status === "loading") {
    statusIcon = <Spinner aria-hidden />
  } else if (status === "queued") {
    statusIcon = <Clock3 />
  } else if (status === "failed" || status === "unavailable") {
    statusIcon = <CircleAlert />
  } else if (status === "synced" || status === "scheduled") {
    statusIcon = <CircleCheck />
  }
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-muted-foreground [&>svg]:size-4" aria-hidden>
            {icon}
          </span>
          <h4 id={id} className="font-medium">
            {title}
          </h4>
        </div>
        <div aria-live="polite">
          <StatusBadge tone={tones[status]} icon={statusIcon}>
            {t(`status.${status}`)}
          </StatusBadge>
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-3" aria-live="polite">
        {detail && <div className="text-xs leading-relaxed text-muted-foreground">{detail}</div>}
        {reconnect && <p className="text-xs text-muted-foreground">{common("reconnectHint")}</p>}
        {showProgress && (
          <div className="flex items-center gap-3">
            <progress
              aria-label={label}
              value={amount}
              max={1}
              className="h-1 min-w-0 flex-1 appearance-none overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-sky-700 dark:[&::-webkit-progress-value]:bg-sky-400 [&::-moz-progress-bar]:bg-sky-700 dark:[&::-moz-progress-bar]:bg-sky-400"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {format.number(amount, { style: "percent" })}
            </span>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {reconnect ? (
          <a href={reconnect} className={cn(buttonVariants({ variant: "outline" }), touchButton, "flex-1")}>
            {common("reconnect")}
          </a>
        ) : (
          <Button
            variant="outline"
            className={cn(touchButton, "flex-1")}
            disabled={disabled || active}
            onClick={onSync}
            aria-label={actionLabel ?? t("syncAction", { label })}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {actionLabel ?? common("syncNow")}
          </Button>
        )}
      </div>
    </section>
  )
}
