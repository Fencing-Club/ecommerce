import { ArrowRight, Building2, CornerDownRight, MapPin, Warehouse } from "lucide-react"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"

// A route on one line: the supplier, any stops on the way, then where the goods end up, an arrow between each. In a
// narrow column the stops go one per line, each after the first led in by a corner arrow from the one above. It's the
// Route section's summary while the section is closed. A container that measures its own width takes none from its
// stops, so in a row it starts at the width it needs for one line and grows, and wraps to its own line when less is left.
export function RoutePreview({ stops, className }: { stops: string[]; className?: string }) {
  const t = useTranslations("shipments.route")
  return (
    <div className={cn("@container/route-preview min-w-0 grow basis-md", className)}>
      <ol
        aria-label={t("title")}
        className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-meta leading-[17px] font-medium @max-md/route-preview:flex-col @max-md/route-preview:items-start @max-md/route-preview:gap-2.5"
      >
        {stops.map((stop, index) => {
          let Icon = Warehouse
          if (index === 0) {
            Icon = Building2
          } else if (index === stops.length - 1) {
            Icon = MapPin
          }
          return (
            <li key={`${index}-${stop}`} className="inline-flex min-w-0 items-center gap-2.5">
              {index > 0 && (
                <ArrowRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground rtl:rotate-180 @max-md/route-preview:hidden"
                />
              )}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {index > 0 && (
                  <CornerDownRight
                    aria-hidden
                    className="hidden size-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100 @max-md/route-preview:block"
                  />
                )}
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                {stop}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
