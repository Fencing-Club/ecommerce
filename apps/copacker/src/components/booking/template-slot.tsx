import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Progress,
  ProgressLabel
} from "@buildkitgg/shadcn"
import { useDropzone } from "@uploadcn/react"
import { CircleCheck, Upload } from "lucide-react"
import { useId, useRef } from "react"
import { useTranslations } from "use-intl"
import { IssueSummary, type IssueSummaryProps } from "./issues"

// Amazon's box-content template is a spreadsheet.
const templateTypes = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsx",
  "application/vnd.ms-excel",
  ".xls"
]

// Where the template Amazon gives back goes: empty until it's dropped or chosen, then filling while Copacker matches it
// to the packing, then filled, or the problem that stopped it, shown as an IssueSummary. `progress` is a percentage.
export type TemplateSlotState =
  | { status: "empty" }
  | { status: "filling"; progress: number; units: number }
  | { status: "filled"; cartons: number; units: number }
  | { status: "issue"; issue: IssueSummaryProps }

function browseLink(chunks: React.ReactNode) {
  return <span className="font-medium text-primary">{chunks}</span>
}

// The AGL start step's place for Amazon's box-content template. Every state keeps the slot's height, so the step never
// jumps as the template fills. A template can be dropped on the empty slot or on a filled one, to replace it.
export function TemplateSlot({ state, onFile }: { state: TemplateSlotState; onFile: (file: File) => void }) {
  const t = useTranslations("booking.template")
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const { handlers, isDragging } = useDropzone({
    accept: templateTypes,
    multiple: false,
    disabled: state.status !== "empty" && state.status !== "filled",
    onDrop: (files) => {
      const [file] = files
      if (file && files.length === 1) {
        onFile(file)
      }
    }
  })
  const browse = () => input.current?.click()
  return (
    // Says what the template became, once checked, without moving focus.
    <div data-slot="template-slot" data-status={state.status} aria-live="polite" className="shrink-0 *:min-h-19">
      <input
        ref={input}
        type="file"
        accept={templateTypes.join(",")}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) {
            onFile(file)
          }
        }}
      />
      {state.status === "empty" && (
        // A button, so the slot takes focus, clicks and drops alike.
        <button
          type="button"
          {...handlers}
          data-dragging={isDragging || undefined}
          onClick={browse}
          className="focus-ring flex w-full items-center gap-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-sidebar px-3 text-start transition-colors *:pointer-events-none hover:bg-muted/50 focus-visible:border-ring data-dragging:border-ring data-dragging:bg-muted/50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
            <Upload className="size-4" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{t("drop")}</span>
            <span className="text-meta text-muted-foreground">{t.rich("browse", { browse: browseLink })}</span>
          </span>
        </button>
      )}
      {state.status === "filling" && (
        <Progress
          value={state.progress}
          aria-describedby={`${id}-matching`}
          className="flex-wrap content-center items-center gap-x-2 gap-y-2.5 rounded-lg border bg-sidebar px-3 *:data-[slot=progress-track]:h-1.5"
        >
          <ProgressLabel className="min-w-0 flex-1">{t("filling")}</ProgressLabel>
          <span id={`${id}-matching`} className="text-meta text-muted-foreground">
            {t("matching", { units: state.units })}
          </span>
        </Progress>
      )}
      {state.status === "filled" && (
        <Item
          variant="outline"
          {...handlers}
          data-dragging={isDragging || undefined}
          className="border-green-50 dark:border-green-950 bg-green-50 dark:bg-green-950 data-dragging:border-ring"
        >
          <ItemMedia variant="icon" className="text-green-800 dark:text-green-400">
            <CircleCheck aria-hidden />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle id={`${id}-filled`}>{t("filled")}</ItemTitle>
            <ItemDescription>{t("matched", { cartons: state.cartons, units: state.units })}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="ghost" size="sm" aria-describedby={`${id}-filled`} onClick={browse}>
              {t("replace")}
            </Button>
          </ItemActions>
        </Item>
      )}
      {state.status === "issue" && <IssueSummary {...state.issue} />}
    </div>
  )
}
