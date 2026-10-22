// The purchase order and shipment lists (docs/logistics-lists.md): their rows as the server sends them, and what narrows,
// orders and pages them in the browser.

// Who a row waits on next. "done" once nobody does.
export type ListParty = "buyer" | "supplier" | "forwarder" | "amazon" | "carrier" | "done"
export type ListStage = "draft" | "active" | "closed" | "cancelled"
export type ListViewer = "buyer" | "supplier" | "forwarder"

// A purchase order or shipment as its list shows it. The server works out the status, stage and who it waits on.
export type LogisticsRow = {
  id: string
  href: string
  // A shipment made in Seller Central opens there.
  external?: boolean
  reference: string
  // A shipment's number among its purchase order's shipments.
  number?: number
  // An Amazon shipment ID, a forwarder's tracking or the shipment's name in Seller Central.
  detail?: string
  // The supplier for a buyer or forwarder, the customer for a supplier; none for a Seller Central shipment.
  partner: string | null
  // The forwarder the goods pass through; none when they go direct.
  forwarder: string | null
  destination: string
  status: string
  stage: ListStage
  waiting: ListParty
  source: "order" | "amazon"
  // A shipment's purchase order.
  orderHref?: string
  // Purchase orders
  products?: number
  shipped?: number
  quantity?: number
  total?: string | null
  // Shipments
  cartons?: number
  ready?: string | null
}

export type ListKind = "orders" | "shipments"
const views = {
  orders: ["needsYou", "draft", "active", "closed", "all"],
  shipments: ["needsYou", "active", "received", "all"]
} as const
export type ListView = (typeof views)[ListKind][number]
export const allViews = ["needsYou", "draft", "active", "closed", "received", "all"] as const
export const columnKeys = {
  orders: ["reference", "partner", "route", "shipped", "total", "status"],
  shipments: ["reference", "partner", "route", "cartons", "ready", "status", "waiting"]
} as const
export type ListColumn = (typeof columnKeys)[ListKind][number]
export const filterKeys = ["partner", "status", "destination", "forwarder", "source"] as const
export type FilterKey = (typeof filterKeys)[number]
export type ListFilters = Record<FilterKey, string>
export type ListSort = "default" | "partner"
export const pageSize = 25

export function inView(row: LogisticsRow, view: ListView, viewer: ListViewer) {
  switch (view) {
    case "needsYou":
      return row.waiting === viewer
    case "draft":
      return row.stage === "draft"
    case "active":
      return row.stage === "active"
    case "closed":
    case "received":
      return row.stage === "closed"
    case "all":
      return true
  }
}

// Only a buyer has drafts, and a forwarder never acts on a purchase order itself.
export function shownViews(kind: ListKind, viewer: ListViewer): ListView[] {
  return views[kind].filter(
    (view) =>
      (view !== "draft" || viewer === "buyer") && (view !== "needsYou" || kind === "shipments" || viewer === "buyer")
  )
}

// The columns a list has: a purchase order's total only when a row has one, since a forwarder sees none.
export function listColumns(kind: ListKind, rows: readonly LogisticsRow[]) {
  return columnKeys[kind].filter((column) => column !== "total" || rows.some((row) => row.total))
}

// What narrows a list: search, a value for each filter as the list shows it, and a range of ready dates.
export type ListCriteria = { query: string; filters: ListFilters; from: string; to: string }

// A row in the viewer's words: its reference, which search matches with its partner and detail, and its value for each
// filter.
export type RowText = {
  reference: (row: LogisticsRow) => string
  value: (row: LogisticsRow, key: FilterKey) => string
}

export function filterRows(rows: readonly LogisticsRow[], { query, filters, from, to }: ListCriteria, text: RowText) {
  const search = query.trim().toLowerCase()
  // Only shipments have ready dates, and a range leaves out those without one.
  const isReadyInRange = (ready: string | null | undefined) =>
    (!from || (!!ready && ready >= from)) && (!to || (!!ready && ready <= to))
  return rows.filter(
    (row) =>
      `${text.reference(row)} ${row.partner ?? ""} ${row.detail ?? ""}`.toLowerCase().includes(search) &&
      filterKeys.every((key) => !filters[key] || text.value(row, key) === filters[key]) &&
      isReadyInRange(row.ready)
  )
}

// Purchase orders keep the server's order, newest first, and shipments go by ready date, latest first; either list can
// go by supplier or customer instead.
export function sortRows(rows: readonly LogisticsRow[], sort: ListSort, kind: ListKind) {
  if (sort === "partner") {
    return rows.toSorted((a, b) => (a.partner ?? "").localeCompare(b.partner ?? ""))
  }
  return kind === "shipments" ? rows.toSorted((a, b) => (b.ready ?? "").localeCompare(a.ready ?? "")) : [...rows]
}

// A row's route in words: the forwarder the goods pass through, then the destination.
export function routeText(
  row: Pick<LogisticsRow, "forwarder" | "destination">,
  t: (key: "route", values: { forwarder: string; destination: string }) => string
) {
  return row.forwarder ? t("route", { forwarder: row.forwarder, destination: row.destination }) : row.destination
}

// A list's state: what narrows and orders it, the page (from 1) and the rows selected. Narrowing or reordering the rows
// goes back to the first page, and so does another view, which also clears the selection.
export type ListState = ListCriteria & { sort: ListSort; page: number; selected: string[] }
export type ListAction =
  | { type: "search"; query: string }
  | { type: "filter"; key: FilterKey; value: string }
  | { type: "ready"; from?: string; to?: string }
  | { type: "clear" }
  | { type: "sort"; sort: ListSort }
  | { type: "view" }
  | { type: "page"; page: number }
  | { type: "select"; selected: string[] }

const noCriteria: ListCriteria = {
  query: "",
  filters: { partner: "", status: "", destination: "", forwarder: "", source: "" },
  from: "",
  to: ""
}
export const startList: ListState = { ...noCriteria, sort: "default", page: 1, selected: [] }

export function listReducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case "search":
      return { ...state, query: action.query, page: 1 }
    case "filter":
      return { ...state, filters: { ...state.filters, [action.key]: action.value }, page: 1 }
    case "ready":
      return { ...state, from: action.from ?? state.from, to: action.to ?? state.to, page: 1 }
    case "clear":
      return { ...state, ...noCriteria, page: 1 }
    case "sort":
      return { ...state, sort: action.sort, page: 1 }
    case "view":
      return { ...state, page: 1, selected: [] }
    case "page":
      return { ...state, page: action.page }
    case "select":
      return { ...state, selected: action.selected }
  }
}

// Whether anything narrows the list, so it shows the applied filters and, when nothing matches, says so.
export const isFiltered = ({ query, filters, from, to }: ListCriteria) =>
  Boolean(query || Object.values(filters).some(Boolean) || from || to)
