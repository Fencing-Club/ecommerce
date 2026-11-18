import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@buildkitgg/shadcn"
import { ChevronDown, Package } from "lucide-react"
import { useTranslations } from "use-intl"
import { FlushCard } from "@/components/flush-card"
import { useMoney } from "@/hooks/use-money"

// One shipment a purchase order's lines become, in the editor and on the PO's page: a card named by where it goes, with
// how many lines and pieces it has and, for those who see prices, its total, that collapses to its header. `select` sits
// before the name, such as the editor's checkbox for all its lines; the lines' table is the card's content.
export function ShipmentGroupCard({
  title,
  heading: Heading = "h2",
  lines,
  pieces,
  total,
  currency,
  select,
  children
}: {
  title: string
  heading?: "h2" | "h3"
  lines: number
  pieces: number
  // Left out for someone who doesn't see prices.
  total?: number
  currency: string
  select?: React.ReactNode
  children: React.ReactNode
}) {
  const t = useTranslations("orders.builder")
  const money = useMoney()
  return (
    <Collapsible defaultOpen render={<FlushCard />}>
      <div className="flex items-center gap-3 px-3 py-2">
        {select}
        <CollapsibleTrigger className="group flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-sm text-start focus-visible:outline-ring">
          <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Heading className="font-semibold">{t("shipmentTo", { destination: title })}</Heading>
          <span className="ms-auto flex flex-col items-end gap-1 text-end text-sm sm:flex-row sm:items-center sm:gap-4">
            <span className="text-muted-foreground">{t("shipmentCounts", { count: lines, pieces })}</span>
            {total !== undefined && (
              <span className="font-semibold whitespace-nowrap tabular-nums">
                <span className="sr-only">{t("shipmentTotal")} </span>
                {money(total, currency)}
              </span>
            )}
          </span>
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent keepMounted>
        <div className="@container border-t">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
