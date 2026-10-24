import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, FieldError } from "@buildkitgg/shadcn-baseui-kit"
import { ChevronRight, Pencil } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useTranslations } from "use-intl"
import { type Route, type RouteChoices, RouteEditor, routeComplete } from "./route-editor"
import { RoutePreview } from "./route-preview"

// The shipment's route, as a section like Products and Cartons. It starts closed, since the route was set up on the
// purchase order, with the stops on one line as its summary. Open, the route is a timeline. Whoever may change it
// (`onSave`) gets Edit route, which turns the stops and legs into menus until Cancel or Save route; a route has to end
// at a final destination to save. The packing's own Ship from field, ready date and pallets (`shipFrom`, `packing`)
// show while packing, whether or not the route is being edited.
export function RouteSection({
  route,
  buyer,
  choices,
  onSave,
  shipFrom,
  packing,
  readyDate,
  defaultOpen = false
}: {
  route: Route
  buyer: string
  choices?: { stops: RouteChoices; destinations: RouteChoices }
  onSave?: (route: Route) => void
  shipFrom?: ReactNode
  packing?: ReactNode
  readyDate?: string
  defaultOpen?: boolean
}) {
  const t = useTranslations("shipments.route")
  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState<Route | null>(null)
  const [tried, setTried] = useState(false)
  const shown = draft ?? route
  const cancel = () => {
    setDraft(null)
    setTried(false)
  }
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label={t("title")} />}
      className="flex flex-col gap-4 max-sm:gap-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 max-sm:flex-col max-sm:items-start">
          <h2 className="text-sm font-semibold max-sm:text-base">
            <CollapsibleTrigger className="focus-ring flex items-center gap-3 rounded-sm text-start max-sm:gap-2">
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 transition-transform in-data-panel-open:rotate-90 rtl:not-in-data-panel-open:rotate-180"
              />
              {t("title")}
            </CollapsibleTrigger>
          </h2>
          {!open && <RoutePreview stops={route.stops.map((stop) => stop.name)} className="max-sm:ps-6" />}
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
          choices={choices}
          onChange={setDraft}
          shipFrom={shipFrom}
          packing={packing}
          readyDate={readyDate}
        />
        {draft && (
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {tried && !routeComplete(draft) && <FieldError className="me-auto">{t("needsDestination")}</FieldError>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={cancel}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setTried(true)
                  if (routeComplete(draft)) {
                    onSave?.(draft)
                    cancel()
                  }
                }}
              >
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
