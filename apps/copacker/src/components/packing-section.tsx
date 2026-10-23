import { ChevronRight, Download, Plus, Upload } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { EmptyState } from "./common"

// What the shipment's Products, Cartons and Pallets share, so the three stay alike: a chevron before the title that opens
// and closes the list, a one-line summary beside the title that turns green once everything is in place, and the list's
// actions at the end of the line. On a phone the title grows and the summary moves under it.
export function PackingSection({
  title,
  summary,
  done = false,
  summaryClassName,
  actions,
  defaultOpen = true,
  children
}: {
  title: string
  summary?: string
  done?: boolean
  summaryClassName?: string
  actions?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      render={<section aria-label={title} />}
      className="flex flex-col gap-4 max-sm:gap-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:flex-col max-sm:items-start">
          <h2 className="text-sm font-semibold max-sm:text-base">
            <CollapsibleTrigger className="focus-ring group flex items-center gap-3 rounded-sm text-start max-sm:gap-2">
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-90"
              />
              {title}
            </CollapsibleTrigger>
          </h2>
          {summary && (
            <span
              className={cn(
                "text-xs tabular-nums text-muted-foreground",
                done && "text-green-800 dark:text-green-400",
                summaryClassName
              )}
            >
              {summary}
            </span>
          )}
        </div>
        {actions}
      </div>
      <CollapsibleContent className="flex flex-col gap-4 max-sm:gap-5">{children}</CollapsibleContent>
    </Collapsible>
  )
}

// A packing list with nothing in it, in a box where its rows would be. While packing it holds the list's first actions,
// which move up to the section's line once the list has a row.
export function PackingEmpty({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      className="flex-none gap-3 rounded-lg border border-solid bg-muted/50 px-6 py-8"
    >
      {children && <div className="flex flex-wrap justify-center gap-2 pt-1">{children}</div>}
    </EmptyState>
  )
}

export type PackingListActions = {
  onAdd: () => void
  onImport: () => void
  onExport: () => void
}

// A list's actions: on the section's line, export and import as icons beside Add, which keeps only its icon on a phone;
// in the empty box, Add and Import with their names, since there's nothing to export yet.
export function PackingActions({
  actions,
  labels,
  empty = false
}: {
  actions: PackingListActions
  labels: { add: string; import: string; export: string }
  empty?: boolean
}) {
  if (empty) {
    return (
      <>
        <Button type="button" variant="outline" onClick={actions.onAdd}>
          <Plus />
          {labels.add}
        </Button>
        <Button type="button" variant="outline" onClick={actions.onImport}>
          <Upload />
          {labels.import}
        </Button>
      </>
    )
  }
  return (
    <div className="flex gap-2">
      <IconAction label={labels.export} onClick={actions.onExport}>
        <Download />
      </IconAction>
      <IconAction label={labels.import} onClick={actions.onImport}>
        <Upload />
      </IconAction>
      <Button type="button" variant="outline" className="max-sm:w-[34px] max-sm:px-0" onClick={actions.onAdd}>
        <Plus />
        <span className="max-sm:sr-only">{labels.add}</span>
      </Button>
    </div>
  )
}

// An icon button named by its tooltip.
function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button type="button" variant="outline" size="icon" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
