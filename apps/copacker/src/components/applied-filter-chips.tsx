import { Button } from "@buildkitgg/shadcn"
import { X } from "lucide-react"
import { useTranslations } from "use-intl"
import { filterKeys, type ListAction, type ListCriteria, type ListKind, type ListViewer } from "@/lib/logistics-list"
import { useLogisticsText } from "./use-logistics-text"

// The filters applied to the purchase order or shipment list, under its toolbar: a chip for each, which removes it,
// and Clear filters for all of them and the search.
export function AppliedFilterChips({
  kind,
  viewer,
  criteria,
  dispatch
}: {
  kind: ListKind
  viewer: ListViewer
  criteria: ListCriteria
  dispatch: (action: ListAction) => void
}) {
  const t = useTranslations("common.logistics")
  const text = useLogisticsText(kind, viewer)
  const { filters, from, to } = criteria
  return (
    <fieldset className="-mt-3 flex min-w-0 flex-wrap items-center gap-2">
      <legend className="sr-only">{t("filters.applied")}</legend>
      {filterKeys
        .filter((key) => filters[key])
        .map((key) => {
          const name = key === "partner" ? text.partnerLabel : t(`filters.${key}`)
          return (
            <Button
              key={key}
              variant="outline"
              size="sm"
              className="max-w-full text-xs"
              aria-label={t("filters.remove", { name })}
              onClick={() => dispatch({ type: "filter", key, value: "" })}
            >
              <span className="truncate">{t("filters.chip", { name, value: filters[key] })}</span>
              <X className="size-3" />
            </Button>
          )
        })}
      {(from || to) && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          aria-label={t("filters.remove", { name: t("filters.ready") })}
          onClick={() => dispatch({ type: "ready", from: "", to: "" })}
        >
          {t("filters.readyRange", {
            from: from ? text.readyDate(from) : t("filters.any"),
            to: to ? text.readyDate(to) : t("filters.any")
          })}
          <X className="size-3" />
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "clear" })}>
        {t("filters.clear")}
      </Button>
    </fieldset>
  )
}
