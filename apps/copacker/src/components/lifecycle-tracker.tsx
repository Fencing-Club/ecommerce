import { ChevronDown, Circle, CircleAlert, CircleCheck, CircleDot } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"

// Done, someone is working on it, the viewer's move, or not started: the status tones' meanings.
export type StageState = "done" | "current" | "attention" | "upcoming"

export type LifecycleStage = {
  id: string
  label: string
  state: StageState
  // Under the stage: the date it was reached, a count or a planned date, or "Waiting on you". Nothing for an upcoming
  // stage with no plan.
  caption?: string
}

// Each state's bar, icon and label: done is green, current blue, the viewer's move amber and upcoming gray. The stage
// someone is on reads a little heavier.
const looks = {
  done: {
    icon: CircleCheck,
    bar: "bg-green-800 dark:bg-green-400",
    tint: "text-green-800 dark:text-green-400",
    label: "font-medium"
  },
  current: {
    icon: CircleDot,
    bar: "bg-sky-700 dark:bg-sky-400",
    tint: "text-sky-700 dark:text-sky-400",
    label: "font-semibold"
  },
  attention: {
    icon: CircleAlert,
    bar: "bg-amber-400",
    tint: "text-amber-800 dark:text-amber-300",
    label: "font-semibold"
  },
  upcoming: {
    icon: Circle,
    bar: "bg-border",
    tint: "text-neutral-400 dark:text-neutral-600",
    label: "font-medium text-muted-foreground"
  }
} satisfies Record<StageState, { icon: React.ElementType; bar: string; tint: string; label: string }>

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
  const spoken = (stage: LifecycleStage) => t("stage", { label: stage.label, state: t(`states.${stage.state}`) })
  return (
    <section data-slot="lifecycle" aria-label={label}>
      <ol className="grid auto-cols-fr grid-flow-col gap-1.5 max-md:hidden">
        {stages.map((stage) => {
          const look = looks[stage.state]
          return (
            <li key={stage.id} className="flex min-w-0 flex-col gap-2" data-state={stage.state}>
              <span className={cn("h-1 rounded-full", look.bar)} aria-hidden />
              <span className="flex min-w-0 items-center gap-1.5 text-meta">
                <look.icon className={cn("size-3.5 shrink-0", look.tint)} aria-hidden />
                <span className={cn("truncate", look.label)} aria-hidden>
                  {stage.label}
                </span>
                <span className="sr-only">{spoken(stage)}</span>
              </span>
              {stage.caption && (
                <span
                  className={cn(
                    "truncate text-xs text-muted-foreground",
                    // Between tablet and desktop widths only the current stage keeps its caption.
                    stage !== current && "max-lg:invisible"
                  )}
                >
                  {stage.caption}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="flex flex-col gap-2 rounded-lg border bg-background px-3.5 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <p className="text-xs font-medium text-muted-foreground">
              {t("stepOf", { step: at + 1, total: stages.length })}
            </p>
            {current && (
              <p className="text-sm font-semibold">
                {current.caption
                  ? t("stageWithCaption", { label: current.label, caption: current.caption })
                  : current.label}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-md text-meta font-medium text-primary"
          >
            {t("allStages")}
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
          </button>
        </div>
        <div className="flex gap-1" aria-hidden>
          {stages.map((stage) => (
            <span key={stage.id} className={cn("h-1 flex-1 rounded-full", looks[stage.state].bar)} />
          ))}
        </div>
        {expanded && (
          <ol className="flex flex-col pt-1.5">
            {stages.map((stage, index) => {
              const look = looks[stage.state]
              return (
                <li key={stage.id} className="flex gap-2.5" data-state={stage.state}>
                  <span className="flex w-3.5 flex-col items-center" aria-hidden>
                    <look.icon className={cn("size-3.5 shrink-0", look.tint)} />
                    {index < stages.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-px pb-2.5">
                    <span className={cn("text-meta", look.label)} aria-hidden>
                      {stage.label}
                    </span>
                    <span className="sr-only">{spoken(stage)}</span>
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
