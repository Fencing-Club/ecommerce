import { Check, RefreshCw, SearchIcon, SearchX, TriangleAlert } from "lucide-react"
import { useId, useState } from "react"
import { useTranslations } from "use-intl"
import { EmptyState, StatusBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import { RadioGroup } from "@/components/ui/radio-group"
import { IssueSummary, type IssueSummaryProps } from "./issues"
import { OptionRow } from "./option-list"

// How many of the newest shipments show before a search.
const recentCount = 4

// A shipment in Amazon, as Seller Central lists it. `shipments` counts an inbound plan's shipments when it has more
// than one. `match` compares it with the packing: the same products and counts, or the same products in other counts.
export type PickerShipment = {
  id: string
  name: string
  shipments?: number
  cartons: number
  units: number
  match?: "matches" | "differs"
}

// Picks one of the shipments in Amazon, newest first. The four newest show until a search, which looks through them all
// by name or ID. The box keeps its height whatever it holds, a search with no results included, and Refresh in the
// search bar asks Amazon again. `issue` shows under the list: the chosen shipment's problem.
export function ShipmentPicker({
  shipments,
  value,
  onValueChange,
  onRefresh,
  refreshing = false,
  defaultQuery = "",
  issue
}: {
  shipments: PickerShipment[]
  value: string | null
  onValueChange: (id: string) => void
  onRefresh: () => void
  refreshing?: boolean
  defaultQuery?: string
  issue?: IssueSummaryProps
}) {
  const t = useTranslations("booking.picker")
  const id = useId()
  const [query, setQuery] = useState(defaultQuery)
  const search = query.trim().toLowerCase()
  const shown = search
    ? shipments.filter(
        (shipment) => shipment.name.toLowerCase().includes(search) || shipment.id.toLowerCase().includes(search)
      )
    : shipments.slice(0, recentCount)
  const status = search
    ? t("resultCount", { count: shown.length })
    : t("matchCount", { count: shown.filter((shipment) => shipment.match === "matches").length })
  return (
    <div
      data-slot="shipment-picker"
      className="flex h-75 shrink-0 flex-col overflow-hidden rounded-lg border transition-colors has-[[data-slot=shipment-search]:focus-visible]:border-ring has-[[data-slot=shipment-search]:focus-visible]:ring-3 has-[[data-slot=shipment-search]:focus-visible]:ring-ring/50"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b ps-3 pe-1.5">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          data-slot="shipment-search"
          aria-label={t("search")}
          placeholder={t("search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("refresh")}
          disabled={refreshing}
          focusableWhenDisabled
          onClick={onRefresh}
          className="text-muted-foreground"
        >
          <RefreshCw className="size-3.5 data-[spinning=true]:animate-spin" data-spinning={refreshing} aria-hidden />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1">
        {shown.length ? (
          <>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <span id={`${id}-heading`} className="font-medium">
                {search ? t("results") : t("recent")}
              </span>
              <span aria-live="polite">{status}</span>
            </div>
            <RadioGroup
              value={value}
              onValueChange={(next) => onValueChange(String(next))}
              aria-labelledby={`${id}-heading`}
              className="gap-0.5"
            >
              {shown.map((shipment) => (
                <OptionRow
                  key={shipment.id}
                  value={shipment.id}
                  title={shipment.name}
                  description={
                    <span className="flex flex-wrap gap-x-2.5">
                      <span className="font-mono">{shipment.id}</span>
                      <span>
                        {shipment.shipments && shipment.shipments > 1
                          ? t("planCounts", {
                              shipments: shipment.shipments,
                              cartons: shipment.cartons,
                              units: shipment.units
                            })
                          : t("counts", { cartons: shipment.cartons, units: shipment.units })}
                      </span>
                    </span>
                  }
                  end={shipment.match && <MatchBadge match={shipment.match} />}
                />
              ))}
            </RadioGroup>
            {issue && (
              <div className="pt-1">
                <IssueSummary {...issue} />
              </div>
            )}
          </>
        ) : (
          <div aria-live="polite" className="flex flex-1 items-center">
            {search ? (
              <EmptyState
                title={t("noResults")}
                description={t("noResultsDescription")}
                media={<SearchX aria-hidden className="size-5" />}
              />
            ) : (
              <EmptyState title={t("none")} description={t("noneDescription")} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MatchBadge({ match }: { match: "matches" | "differs" }) {
  const t = useTranslations("booking.picker")
  return match === "matches" ? (
    <StatusBadge tone="success" icon={<Check aria-hidden />}>
      {t("matches")}
    </StatusBadge>
  ) : (
    <StatusBadge tone="warning" icon={<TriangleAlert aria-hidden />}>
      {t("differs")}
    </StatusBadge>
  )
}
