import { Download } from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { useReducer, useState } from "react"
import { useTranslations } from "use-intl"
import { PageHeader } from "@/components/common"
import { usePagedRows } from "@/components/list/use-paged-rows"
import { TabLinks } from "@/components/tab-links"
import { Button } from "@/components/ui/button"
import { csvCell } from "@/lib/csv"
import { downloadBlob } from "@/lib/download"
import {
  allViews,
  filterRows,
  inView,
  isFiltered,
  type ListColumn,
  listColumns,
  type ListKind,
  listReducer,
  type ListView,
  type ListViewer,
  type LogisticsRow,
  pageSize,
  shownViews,
  sortRows,
  startList
} from "@/lib/logistics-list"
import { AppliedFilterChips } from "./applied-filter-chips"
import { LogisticsPagination } from "./logistics-pagination"
import { LogisticsTable } from "./logistics-table"
import { LogisticsToolbar } from "./logistics-toolbar"
import { useLogisticsText } from "./use-logistics-text"

function download(name: string, lines: string[][]) {
  const csv = lines.map((line) => line.map(csvCell).join(",")).join("\r\n")
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`)
}

// The purchase order and shipment lists: views kept in the URL, then search, filters, sorting, columns, selection,
// export and pages over the rows the server sent.
export function LogisticsList({
  kind,
  viewer,
  rows,
  view: initialView,
  actions,
  notice
}: {
  kind: ListKind
  viewer: ListViewer
  rows: LogisticsRow[]
  // The view the URL asked for.
  view?: string
  // The page's own actions, such as creating a purchase order.
  actions?: React.ReactNode
  // Something the viewer should know about the list, under its header.
  notice?: React.ReactNode
}) {
  const t = useTranslations("common.logistics")
  const k = useTranslations(`common.logistics.${kind}`)
  const text = useLogisticsText(kind, viewer)
  const isOrder = kind === "orders"
  const tabs = shownViews(kind, viewer)
  const fallback: ListView = tabs.find((tab) => tab === (isOrder ? "needsYou" : "all")) ?? "active"
  const [requested, setView] = useQueryState("view", parseAsStringLiteral(allViews).withOptions({ history: "replace" }))
  const view = tabs.find((tab) => tab === (requested ?? initialView)) ?? fallback
  const [state, dispatch] = useReducer(listReducer, startList)
  const [hidden, setHidden] = useState<ListColumn[]>([])
  const matches = filterRows(rows, state, text)
  const shown = sortRows(
    matches.filter((row) => inView(row, view, viewer)),
    state.sort,
    kind
  )
  const paged = usePagedRows(shown, pageSize, { page: state.page, onPage: (page) => dispatch({ type: "page", page }) })
  const filtered = isFiltered(state)

  function exportRows(list: LogisticsRow[]) {
    const columns = listColumns(kind, list)
    download(k("file"), [
      columns.map(text.columnLabel),
      ...list.map((row) => columns.map((column) => text.cellText(row, column)))
    ])
  }

  return (
    <div className="@container/list flex min-w-0 flex-col gap-6">
      <PageHeader title={k("title")}>
        {actions}
        {!isOrder && (
          <Button variant="outline" onClick={() => exportRows(shown)} disabled={!shown.length}>
            <Download data-icon="inline-start" />
            {t("export")}
          </Button>
        )}
      </PageHeader>
      {notice}
      <TabLinks
        label={k("views")}
        tabs={tabs.map((tab) => ({
          label: t(`views.${tab}`),
          href: `/${kind}?view=${tab}`,
          current: view === tab,
          count: matches.filter((row) => inView(row, tab, viewer)).length,
          attention: tab === "needsYou"
        }))}
        onSelect={(href) => {
          void setView(tabs.find((tab) => href.endsWith(`=${tab}`)) ?? null)
          dispatch({ type: "view" })
        }}
      />
      <LogisticsToolbar
        kind={kind}
        viewer={viewer}
        rows={rows}
        state={state}
        hidden={hidden}
        dispatch={dispatch}
        onHiddenChange={setHidden}
      />
      {filtered && <AppliedFilterChips kind={kind} viewer={viewer} criteria={state} dispatch={dispatch} />}
      {state.selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <output>{t("selection.count", { count: state.selected.length })}</output>
          <Button variant="outline" onClick={() => exportRows(rows.filter((row) => state.selected.includes(row.id)))}>
            <Download data-icon="inline-start" />
            {t("selection.export")}
          </Button>
          <Button variant="ghost" onClick={() => dispatch({ type: "select", selected: [] })}>
            {t("selection.clear")}
          </Button>
        </div>
      )}
      <LogisticsTable
        kind={kind}
        viewer={viewer}
        rows={paged.rows}
        columns={listColumns(kind, rows).filter((column) => !hidden.includes(column))}
        view={view}
        isFiltered={filtered}
        selected={state.selected}
        onSelectedChange={(selected) => dispatch({ type: "select", selected })}
        onClear={() => dispatch({ type: "clear" })}
      />
      <LogisticsPagination kind={kind} {...paged.pager} />
    </div>
  )
}
