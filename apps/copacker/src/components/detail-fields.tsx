import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function DetailFields({
  items,
  className
}: {
  items: { label: string; value: ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn("grid gap-4 text-sm", className)}>
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
