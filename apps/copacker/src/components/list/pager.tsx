import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "use-intl"

// Previous and next, for a list's pages counted from 1. Each is an arrow named for screen readers; with `words`, a
// small button that says Previous or Next beside its arrow. The caller lays them out with what goes beside them.
export function PageButtons({
  page,
  pages,
  onPage,
  words = false
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  words?: boolean
}) {
  const t = useTranslations("common.list.pager")
  const first = page <= 1
  const last = page >= pages
  if (words) {
    return (
      <>
        <Button variant="outline" size="sm" disabled={first} onClick={() => onPage(page - 1)}>
          <ChevronLeft data-icon="inline-start" className="rtl:rotate-180" />
          {t("previousShort")}
        </Button>
        <Button variant="outline" size="sm" disabled={last} onClick={() => onPage(page + 1)}>
          {t("nextShort")}
          <ChevronRight data-icon="inline-end" className="rtl:rotate-180" />
        </Button>
      </>
    )
  }
  return (
    <>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label={t("previous")}
        disabled={first}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <Button size="icon-sm" variant="outline" aria-label={t("next")} disabled={last} onClick={() => onPage(page + 1)}>
        <ChevronRight className="rtl:rotate-180" />
      </Button>
    </>
  )
}

// Pages of a long table, like Shopify's: which rows show, and previous and next. Nothing while every row fits on one
// page. `usePagedRows` gives a list filtered in the browser its props.
export function Pager({
  page,
  pages,
  total,
  size,
  onPage
}: {
  page: number
  pages: number
  total: number
  size: number
  onPage: (page: number) => void
}) {
  const t = useTranslations("common.list.pager")
  if (pages <= 1) {
    return null
  }
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {t("range", { first: (page - 1) * size + 1, last: Math.min(total, page * size), total })}
      </span>
      <div className="flex gap-1">
        <PageButtons page={page} pages={pages} onPage={onPage} />
      </div>
    </div>
  )
}
