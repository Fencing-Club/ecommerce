import { z } from "zod"
import { periodQuery, type Period } from "./date-range"
import { stringifyUrlSearch } from "./url-search"

// Preserve the established URL contract, including unrelated keys owned by other controls.
const searchValue = z.union([z.string(), z.number(), z.boolean()]).transform(String)
export const overviewSearch = z.record(z.string(), z.union([searchValue, z.array(searchValue)]).optional())
export type OverviewSearch = z.infer<typeof overviewSearch>

export function selectOverviewPeriod(query: OverviewSearch, period: Pick<Period, "key" | "range" | "comparison">) {
  const next = { ...query }
  for (const key of ["period", "from", "to", "compare"]) {
    delete next[key]
  }
  return { ...next, ...Object.fromEntries(periodQuery(period)) }
}

export function selectOverviewChannel(query: OverviewSearch, channel: string | null) {
  const next = { ...query }
  delete next.channel
  return channel ? { ...next, channel } : next
}

export function overviewHref(query: OverviewSearch) {
  return `/overview${stringifyUrlSearch(query)}`
}
