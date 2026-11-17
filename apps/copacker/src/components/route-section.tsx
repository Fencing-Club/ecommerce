import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, FieldError } from "@buildkitgg/shadcn"
import { useUncontrolled } from "@mantine/hooks"
import { type Route, routeIssues } from "@repo/copacker-packing-rules"
import { ChevronRight, Pencil } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useTranslations } from "use-intl"
import { SubmitButton } from "./form-feedback"
import { type RouteChoices, RouteEditor, type RouteStop } from "./route-editor"
import { RoutePreview } from "./route-preview"

// The shipment's route, as a section like Products and Cartons. It starts closed, since the route was set up on the
// purchase order, with the stops on one line as its summary. Open, the route is a timeline, with any `notes` under it.
// Whoever may change it (`onSave`) gets Edit route, which turns the stops and legs into menus until Cancel or Save
// route. A route the route rules find an issue with doesn't save, and its first issue shows. Saving keeps the menus open,
// though off (`saving`), until `onSave` resolves, and when it resolves false, with its `error`, so the route can be fixed
// or cancelled. The packing's own Ship
// from field, ready date and pallets (`shipFrom`, `packing`) show while packing, whether or not the route is being
// edited; the packing form keeps the section open (`open`) while they need fixing. Its lines stop at a readable width
// rather than running across the page.
export function RouteSection({
  route,
  buyer,
  choices,
  onSave,
  onCancel,
  saving = false,
  error,
  shipFrom,
  packing,
  readyDate,
  notes,
  defaultOpen = false,
  open: openProp,
  onOpenChange
}: {
  route: Route<RouteStop>
  buyer: string
  choices?: RouteChoices
  onSave?: (route: Route<RouteStop>) => Promise<boolean> | void
  onCancel?: () => void
  saving?: boolean
  error?: string
  shipFrom?: ReactNode
  packing?: ReactNode
  readyDate?: string
  notes?: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("shipments.route")
  const [open, setOpen] = useUncontrolled({
    value: openProp,
    defaultValue: defaultOpen,
    finalValue: false,
    onChange: onOpenChange
  })
  const [draft, setDraft] = useState<Route<RouteStop> | null>(null)
  const [tried, setTried] = useState(false)
  const shown = draft ?? route
  const issue = draft && routeIssues(draft)[0]
  const close = () => {
    setDraft(null)
    setTried(false)
  }
  const cancel = () => {
    close()
    onCancel?.()
  }
  const save = async (route: Route<RouteStop>) => {
    setTried(true)
    if (!issue && (await onSave?.(route)) !== false) {
      close()
    }
  }
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label={t("title")} />}
      className="flex max-w-prose flex-col gap-4 max-sm:gap-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-sm font-semibold max-sm:text-base">
            <CollapsibleTrigger className="focus-ring flex items-center gap-3 rounded-sm text-start max-sm:gap-2">
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 transition-transform in-data-panel-open:rotate-90 rtl:not-in-data-panel-open:rotate-180"
              />
              {t("title")}
            </CollapsibleTrigger>
          </h2>
          {!open && (
            <RoutePreview stops={route.stops.map((stop) => stop.name)} className="max-sm:basis-full max-sm:ps-6" />
          )}
        </div>
        {open && onSave && !draft && (
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft(route)}>
            <Pencil />
            {t("editRoute")}
          </Button>
        )}
      </div>
      <CollapsibleContent className="flex flex-col gap-4">
        <RouteEditor
          route={shown}
          buyer={buyer}
          editing={!!draft}
          disabled={saving}
          choices={choices}
          onChange={setDraft}
          shipFrom={shipFrom}
          packing={packing}
          readyDate={readyDate}
        />
        {notes}
        {draft && (
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {tried && (issue || error) && (
              <FieldError className="me-auto">{issue ? t(`issues.${issue.code}`) : error}</FieldError>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={cancel} disabled={saving}>
                {t("cancel")}
              </Button>
              <SubmitButton type="button" pending={saving} onClick={() => void save(draft)}>
                {t("save")}
              </SubmitButton>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
