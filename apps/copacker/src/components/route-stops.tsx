import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const arrow = <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />

// A purchase order's route as its editor, its page and its forwarder's view show it: the supplier, the forwarder's stop
// when there is one, then where the goods go, an arrow between each, and the route's actions after them. Each stop is a
// pill, or a picker for one in the editor.
export function RouteStops({
  supplier,
  stop,
  destination,
  className,
  children
}: {
  supplier: React.ReactNode
  stop?: React.ReactNode
  destination: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 p-3", className)}>
      {supplier}
      {arrow}
      {stop && (
        <>
          {stop}
          {arrow}
        </>
      )}
      {destination}
      {children}
    </div>
  )
}
