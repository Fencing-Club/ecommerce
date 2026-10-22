import { useTranslations } from "use-intl"
import { PageButtons } from "@/components/list/pager"
import type { ListKind } from "@/lib/logistics-list"

// Under the purchase order or shipment list: how many rows it holds, and past a page, which of them it shows with the
// list kit's buttons to the pages before and after. `usePagedRows` gives it the page, from 1, and the rest.
export function LogisticsPagination({
  kind,
  page,
  pages,
  total,
  size,
  onPage
}: {
  kind: ListKind
  page: number
  pages: number
  // The rows the view and filters leave.
  total: number
  size: number
  onPage: (page: number) => void
}) {
  const k = useTranslations(`common.logistics.${kind}`)
  const isPaged = pages > 1
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        {isPaged
          ? k("showing", { from: (page - 1) * size + 1, to: Math.min(page * size, total), count: total })
          : k("count", { count: total })}
      </span>
      {isPaged && (
        <div className="flex gap-1">
          <PageButtons page={page} pages={pages} onPage={onPage} />
        </div>
      )}
    </div>
  )
}
