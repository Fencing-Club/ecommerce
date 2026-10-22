import { useFormatter, useTranslations } from "use-intl"
import { useStatusLabel } from "@/components/common"
import {
  type FilterKey,
  type ListColumn,
  type ListKind,
  type ListParty,
  type ListViewer,
  type LogisticsRow,
  routeText
} from "@/lib/logistics-list"

// How the purchase order and shipment lists word a row for the viewer: its reference, ready date, route and who it
// waits on, each column's name and text, as the export writes it, and its value for each filter.
export function useLogisticsText(kind: ListKind, viewer: ListViewer) {
  const t = useTranslations("common.logistics")
  const k = useTranslations(`common.logistics.${kind}`)
  const format = useFormatter()
  const statusLabel = useStatusLabel()
  const partnerLabel = viewer === "supplier" ? t("filters.customer") : t("filters.supplier")
  const waitingLabel = (party: ListParty) => {
    if (party === viewer) {
      return t("waiting.you")
    }
    return party === "buyer" && viewer === "supplier" ? t("waiting.customer") : t(`waiting.${party}`)
  }
  const reference = (row: LogisticsRow) =>
    row.number ? t("shipmentReference", { reference: row.reference, number: row.number }) : row.reference
  const readyDate = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" })
  const route = (row: LogisticsRow) => routeText(row, t)
  const shipped = (row: LogisticsRow) => t("shipped", { shipped: row.shipped ?? 0, quantity: row.quantity ?? 0 })
  const columnLabel = (column: ListColumn) => {
    if (column === "reference") {
      return k("reference")
    }
    return column === "partner" ? partnerLabel : t(`columns.${column}`)
  }
  const cellText = (row: LogisticsRow, column: ListColumn) => {
    switch (column) {
      case "reference":
        return reference(row)
      case "partner":
        return row.partner ?? ""
      case "route":
        return route(row)
      case "shipped":
        return shipped(row)
      case "total":
        return row.total ?? ""
      case "cartons":
        return String(row.cartons ?? "")
      case "ready":
        return row.ready ?? ""
      case "status":
        return statusLabel(row.status)
      case "waiting":
        return waitingLabel(row.waiting)
    }
  }
  const value = (row: LogisticsRow, key: FilterKey) => {
    switch (key) {
      case "partner":
        return row.partner ?? ""
      case "status":
        return statusLabel(row.status)
      case "destination":
        return row.destination
      case "forwarder":
        return row.forwarder ?? t("direct")
      case "source":
        return row.source === "amazon" ? t("sources.amazon") : t("sources.order")
    }
  }
  return { partnerLabel, waitingLabel, reference, readyDate, route, shipped, columnLabel, cellText, value }
}
