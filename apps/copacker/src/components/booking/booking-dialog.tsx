import { useDidUpdate, useElementSize } from "@mantine/hooks"
import { useRef } from "react"
import { useTranslations } from "use-intl"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

// The dialog the Amazon booking flows (AGL and FBA) run in: 512px wide, and one height for every step, so moving
// between steps never resizes it. Each step renders the parts below: a header, a body and a footer. The body takes the
// height the header and footer leave and scrolls within it, so a long list never makes the dialog taller.
//
// `screen` names the step showing. When it changes, focus moves to the dialog, so a screen reader announces the new
// step's title rather than losing focus with the button that led there.
export function BookingDialog({
  open,
  defaultOpen,
  onOpenChange,
  screen,
  children
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  screen?: string
  children: React.ReactNode
}) {
  const popup = useRef<HTMLDivElement>(null)
  useDidUpdate(() => popup.current?.focus(), [screen])
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={(next) => onOpenChange?.(next)}>
      <DialogContent
        ref={popup}
        data-slot="booking-dialog"
        className="flex max-h-[calc(100dvh-2rem)] min-h-[min(30rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-lg"
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function BookingDialogHeader({ title, description }: { title: React.ReactNode; description: React.ReactNode }) {
  return (
    <DialogHeader className="shrink-0 px-4 pt-4">
      {/* Clear of the close button in the corner. */}
      <DialogTitle className="pe-8 leading-5">{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
  )
}

// Grows into the height the header and footer leave, from nothing, so its content never adds to the dialog's height.
// Content taller than that scrolls, and the body then takes focus, so the keyboard can scroll it too. `className` lays
// out the content.
export function BookingDialogBody({ className, children, ...props }: React.ComponentProps<"div">) {
  const { ref: viewport, height: available } = useElementSize()
  const { ref: content, height: needed } = useElementSize()
  return (
    <div
      ref={viewport}
      data-slot="booking-dialog-body"
      // A scrolling region the keyboard can't reach can't be read to the end.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={needed > available ? 0 : undefined}
      className="min-h-0 grow basis-0 overflow-y-auto p-4 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      {...props}
    >
      <div ref={content} className={cn("flex flex-col gap-3", className)}>
        {children}
      </div>
    </div>
  )
}

// The step's actions on the right, and on the left how far through the flow it is, when the step is one of a count.
export function BookingDialogFooter({
  step,
  children
}: {
  step?: { current: number; total: number }
  children: React.ReactNode
}) {
  const t = useTranslations("shipments.booking")
  return (
    <DialogFooter className="m-0 shrink-0 flex-row flex-wrap items-center justify-between gap-x-2 gap-y-3 sm:justify-between">
      {step && (
        <Progress
          value={step.current}
          max={step.total}
          aria-valuetext={t("step", step)}
          className="flex-nowrap items-center gap-2 *:data-[slot=progress-track]:w-10 *:data-[slot=progress-track]:shrink-0"
        >
          <ProgressLabel className="order-last text-[13px] font-normal text-muted-foreground">
            {t("step", step)}
          </ProgressLabel>
        </Progress>
      )}
      <div className="ms-auto flex items-center gap-2">{children}</div>
    </DialogFooter>
  )
}
