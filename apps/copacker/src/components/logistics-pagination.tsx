import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { type ListKind, pageSize } from "@/lib/logistics-list"

// Under the purchase order or shipment list: how many rows it holds, and past a page, which of them it shows with the
// buttons to the pages before and after. The page math is Mantine's usePagination, which the list keeps.
export function LogisticsPagination({
  kind,
  count,
  pagination
}: {
  kind: ListKind
  // The rows the view and filters leave.
  count: number
  // The page shown, from 1, and the steps to the pages around it.
  pagination: { active: number; next: () => void; previous: () => void }
}) {
  const t = useTranslations("common.logistics")
  const k = useTranslations(`common.logistics.${kind}`)
  const { active } = pagination
  const isPaged = count > pageSize
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        {isPaged
          ? k("showing", {
              from: (active - 1) * pageSize + 1,
              to: Math.min(active * pageSize, count),
              count
            })
          : k("count", { count })}
      </span>
      {isPaged && (
        <div className="flex gap-2">
          <Button
            aria-label={t("previousPage")}
            variant="outline"
            size="icon"
            disabled={active === 1}
            onClick={pagination.previous}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <Button
            aria-label={t("nextPage")}
            variant="outline"
            size="icon"
            disabled={active * pageSize >= count}
            onClick={pagination.next}
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      )}
    </div>
  )
}
