"use client"

import { ChevronDown, CircleCheck, CircleDashed, CircleDot, CircleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { cn } from "@/lib/utils"

// Done, someone is working on it, the viewer's move, or not started: the status tones' meanings.
export type StageState = "done" | "current" | "attention" | "upcoming"

export type LifecycleStage = {
  id: string
  label: string
  state: StageState
  // Under the stage: the date it was reached, a count or a planned date, or "Waiting on you". Nothing for an upcoming
  // stage with no plan.
  caption?: React.ReactNode
}

const looks = {
  done: { icon: CircleCheck, bar: "bg-success", tint: "text-success" },
  current: { icon: CircleDot, bar: "bg-info", tint: "text-info" },
  attention: { icon: CircleAlert, bar: "bg-warning", tint: "text-warning-foreground" },
  upcoming: { icon: CircleDashed, bar: "bg-border", tint: "text-disabled-foreground" }
} satisfies Record<StageState, { icon: React.ElementType; bar: string; tint: string }>

// Where a purchase order, shipment, leg or combined shipment is: its stages in order, each done, current, waiting on the
// viewer or not started. A row of stage bars on a wide screen; on a phone, a card with the current stage and an "All
// stages" list. Stages are an ordered list whose state is read out, never shown by color alone.
export function LifecycleTracker({ label, stages }: { label: string; stages: ReadonlyArray<LifecycleStage> }) {
  const t = useTranslations("common.lifecycle")
  const [expanded, setExpanded] = useState(false)
  const at = Math.max(
    0,
    stages.findIndex((stage) => stage.state === "current" || stage.state === "attention"),
    stages.findLastIndex((stage) => stage.state === "done")
  )
  const current = stages[at]
  return (
    <section data-slot="lifecycle" aria-label={label}>
      <ol className="grid auto-cols-fr grid-flow-col gap-3 max-md:hidden">
        {stages.map((stage) => {
          const { icon: Icon, bar, tint } = looks[stage.state]
          return (
            <li key={stage.id} className="flex min-w-0 flex-col gap-2" data-state={stage.state}>
              <span className={cn("h-1 rounded-full", bar)} aria-hidden />
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
                <Icon className={cn("size-3.5 shrink-0", tint)} aria-hidden />
                <span className="truncate" aria-hidden>
                  {stage.label}
                </span>
                <span className="sr-only">{t("stage", { label: stage.label, state: t(`states.${stage.state}`) })}</span>
              </span>
              {stage.caption ? (
                <span
                  className={cn(
                    "truncate text-xs text-muted-foreground",
                    // Between tablet and desktop widths only the current stage keeps its caption.
                    stage !== current && "max-lg:invisible"
                  )}
                >
                  {stage.caption}
                </span>
              ) : (
                <span className="h-4" aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
      <div className="rounded-lg border p-3 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("stepOf", { step: at + 1, total: stages.length })}</p>
            {current && (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{current.label}</span>
                {current.caption && <span className="text-xs text-muted-foreground">{current.caption}</span>}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("allStages")}
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {stages.map((stage) => (
            <span key={stage.id} className={cn("h-1 flex-1 rounded-full", looks[stage.state].bar)} />
          ))}
        </div>
        {expanded && (
          <ol className="mt-3 flex flex-col">
            {stages.map((stage, index) => {
              const { icon: Icon, tint } = looks[stage.state]
              return (
                <li key={stage.id} className="flex gap-2.5" data-state={stage.state}>
                  <span className="flex flex-col items-center" aria-hidden>
                    <Icon className={cn("size-4 shrink-0", tint)} />
                    {index < stages.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}
                  </span>
                  <span className="flex min-w-0 flex-col pb-3">
                    <span className="text-sm font-medium" aria-hidden>
                      {stage.label}
                    </span>
                    <span className="sr-only">
                      {t("stage", { label: stage.label, state: t(`states.${stage.state}`) })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {stage.caption ?? (stage.state === "upcoming" ? t("states.upcoming") : null)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
