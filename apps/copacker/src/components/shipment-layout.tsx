import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// The shipment page, packing or packed: the header, then a column of the shipment's notices, its route and addresses,
// its products and what follows them (the cartons and pallets), beside a sidebar of its documents and totals. Below
// 64rem of width the sidebar follows the column. While packing saves, the column and sidebar are disabled; the header
// stays outside them, so a form it holds stays usable.
export function ShipmentLayout({
  header,
  notices,
  details,
  products,
  sidebar,
  busy = false,
  children
}: {
  header?: ReactNode
  notices?: ReactNode
  details?: ReactNode
  products?: ReactNode
  sidebar?: ReactNode
  busy?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {header}
      <fieldset disabled={busy} className="@container/po flex min-w-0 flex-col gap-6 text-sm">
        <div className={cn("grid min-w-0 items-start gap-6", sidebar && "@5xl/po:grid-cols-[minmax(0,1fr)_17rem]")}>
          <div className="flex min-w-0 flex-col gap-6">
            {notices}
            {details}
            {products}
            {children}
          </div>
          {sidebar && <aside className="min-w-0">{sidebar}</aside>}
        </div>
      </fieldset>
    </div>
  )
}
