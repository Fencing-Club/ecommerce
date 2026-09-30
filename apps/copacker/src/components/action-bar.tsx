"use client"

import { CircleAlert, CircleDot, GitCompareArrows, ListChecks, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ActionBarTone = "warning" | "neutral" | "info" | "destructive"

// The lead tile's color and icon: unsaved changes, a flow's running summary or a selection, a proposal to review, and a
// submit that's blocked.
const leads = {
  warning: { icon: CircleDot, className: "bg-warning/15 text-warning-foreground" },
  neutral: { icon: ListChecks, className: "bg-muted text-muted-foreground" },
  info: { icon: GitCompareArrows, className: "bg-info/10 text-info" },
  destructive: { icon: CircleAlert, className: "bg-destructive/10 text-destructive" }
} satisfies Record<ActionBarTone, { icon: React.ElementType; className: string }>

// The one bar for committing or acting on a page: unsaved changes, a task flow's summary and submit, a proposal to
// review, and bulk actions on selected rows. It floats over the bottom of the page's column on a wide screen, and docks
// to the bottom edge on a phone, where the primary action takes the width that's left. Render it only while it applies:
// once something changes, throughout a flow, or while rows are selected.
export function ActionBar({
  tone = "warning",
  title,
  detail,
  problems,
  onProblems,
  onDiscard,
  onClose,
  secondary,
  primary,
  className
}: {
  tone?: ActionBarTone
  title?: React.ReactNode
  detail?: React.ReactNode
  // How many problems stop the primary action; the pill jumps to the first.
  problems?: number
  onProblems?: () => void
  onDiscard?: () => void
  // Clears a selection, for bulk actions.
  onClose?: () => void
  // Up to three secondary buttons.
  secondary?: React.ReactNode
  primary?: React.ReactNode
  className?: string
}) {
  const t = useTranslations("common.actionBar")
  const { icon: Icon, className: lead } = leads[tone]
  return (
    <section
      data-slot="action-bar"
      data-tone={tone}
      aria-label={t("label")}
      className={cn(
        "sticky bottom-6 z-30 mt-6 flex items-center gap-3 rounded-xl border bg-background py-2.5 ps-3 pe-2.5 shadow-[0_10px_28px_rgb(15_15_15/0.12),0_1px_3px_rgb(15_15_15/0.08)]",
        "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:mt-0 max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:px-4 max-md:pt-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {title && (
        <>
          <span
            className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg max-md:hidden", lead)}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
          <div aria-live="polite" className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
          </div>
        </>
      )}
      {problems ? (
        <button
          type="button"
          onClick={onProblems}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 self-start rounded-full bg-destructive/10 px-2.5 text-xs font-semibold text-destructive outline-none hover:bg-destructive/15 focus-visible:ring-3 focus-visible:ring-destructive/30 md:self-center"
        >
          <CircleAlert className="size-3.5" aria-hidden />
          {t("problems", { count: problems })}
        </button>
      ) : null}
      <div className="flex shrink-0 items-center gap-2 max-md:flex-wrap md:ms-auto [&_[data-slot=button]]:h-[34px]">
        {onDiscard && (
          <Button variant="ghost" onClick={onDiscard} className="text-muted-foreground">
            {t("discard")}
          </Button>
        )}
        {secondary}
        {/* On a phone the primary action fills what the other buttons leave. */}
        {primary && <span className="flex max-md:flex-1 max-md:[&>*]:w-full">{primary}</span>}
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("clearSelection")}
            className="size-[34px]"
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
    </section>
  )
}
