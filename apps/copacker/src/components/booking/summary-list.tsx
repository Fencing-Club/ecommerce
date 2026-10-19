import { cn } from "@/lib/utils"

export type SummaryItem = {
  label: string
  value: React.ReactNode
  // Under the value, such as a warehouse's code.
  detail?: React.ReactNode
}

// What a booking comes to, before it's booked: each part as a label and its value, with the total last and stronger.
export function SummaryList({
  items,
  total,
  className
}: {
  items: SummaryItem[]
  total: { label: string; value: React.ReactNode }
  className?: string
}) {
  return (
    <dl
      data-slot="summary-list"
      className={cn("shrink-0 divide-y overflow-hidden rounded-lg border text-sm", className)}
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="flex min-w-0 flex-col items-end gap-0.5 text-end tabular-nums">
            {item.value}
            {item.detail && <span className="text-xs text-muted-foreground">{item.detail}</span>}
          </dd>
        </div>
      ))}
      <div data-slot="summary-total" className="flex items-start justify-between gap-3 bg-muted/50 px-3 py-2">
        <dt className="font-medium">{total.label}</dt>
        <dd className="font-semibold tabular-nums">{total.value}</dd>
      </div>
    </dl>
  )
}
