import type { LucideIcon } from "lucide-react"
import { ArrowRight, Hourglass, LoaderCircle, TriangleAlert } from "lucide-react"
import { useId } from "react"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"

// What moves a purchase order, shipment, leg or combined shipment on, told from the viewer's side: the viewer's own next
// step (warm), or who the viewer is waiting on (quiet), or a job that's running. One title line, then an optional detail
// and an alert when something blocks the step; supporting facts go in the meta (days left, a window). At most a
// secondary and a primary action; a waiting card has no primary, only a way to where the other party works. `icon` names
// the step (a file for an invoice, a truck for shipping). On a phone the card stacks, drops its icon and its actions,
// which move to the docked action bar, so pass them there too.
export function NextStepCard({
  waitingOn,
  working,
  icon,
  title,
  detail,
  alert,
  meta,
  metaDetail,
  secondary,
  primary,
  className
}: {
  // Who has the ball when it isn't the viewer.
  waitingOn?: string
  // A job Copacker is running, such as creating the Amazon shipment; the card refreshes with the page.
  working?: boolean
  icon?: LucideIcon
  title: React.ReactNode
  detail?: React.ReactNode
  alert?: React.ReactNode
  meta?: React.ReactNode
  metaDetail?: React.ReactNode
  secondary?: React.ReactNode
  primary?: React.ReactNode
  className?: string
}) {
  const t = useTranslations("common.nextStep")
  const titleId = useId()
  const yours = !waitingOn && !working
  const { icon: Icon, eyebrow } = look()
  function look() {
    if (working) {
      return { icon: LoaderCircle, eyebrow: t("working") }
    }
    if (waitingOn) {
      return { icon: icon ?? Hourglass, eyebrow: t("waitingOn", { name: waitingOn }) }
    }
    return { icon: icon ?? ArrowRight, eyebrow: t("yours") }
  }
  return (
    <section
      data-slot="next-step"
      data-waiting={yours ? undefined : ""}
      aria-labelledby={titleId}
      className={cn(
        "flex items-center gap-3.5 rounded-lg border p-4 max-md:flex-col max-md:items-start max-md:gap-2.5 max-md:p-3.5",
        yours ? "border-primary-border bg-primary-tint" : "bg-background",
        className
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[9px] max-md:hidden",
          yours ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"
        )}
        aria-hidden
      >
        <Icon className={cn("size-[18px]", working && "animate-spin")} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className={cn("text-xs font-semibold", yours ? "text-primary" : "text-muted-foreground")}>{eyebrow}</p>
        <h2 id={titleId} className="text-[15px] font-semibold">
          {title}
        </h2>
        {detail && <p className="text-meta leading-[1.45] text-muted-foreground">{detail}</p>}
        {alert && (
          <p className="flex items-center gap-1.5 pt-1 text-xs font-medium text-warning-foreground">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            {alert}
          </p>
        )}
      </div>
      {meta && (
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-end max-md:items-start max-md:text-start">
          <span className="text-meta font-semibold">{meta}</span>
          {metaDetail && <span className="text-xs text-muted-foreground">{metaDetail}</span>}
        </div>
      )}
      {(secondary || primary) && (
        <div className="flex shrink-0 items-center gap-2 max-md:hidden">
          {secondary}
          {primary}
        </div>
      )}
    </section>
  )
}
