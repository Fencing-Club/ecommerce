import { useTranslations } from "next-intl"
import { Children } from "react"
import { InfoTip } from "@/components/info-tip"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// The KPI cards, apart from the rest of @/components/common: their info tips bring Base UI's tooltip, which a client
// component that only needs a status badge from common shouldn't download.

// A KPI: its label on one line, the figure, and an optional caption, such as a change from the previous period.
export function StatCard({
  label,
  value,
  caption,
  info,
  children
}: {
  label: string
  value: string | number
  caption?: React.ReactNode
  // What the figure means, behind an info icon after the label.
  info?: React.ReactNode
  // Anything under the figure, such as a sparkline.
  children?: React.ReactNode
}) {
  const t = useTranslations("common")
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardDescription className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="truncate">{label}</span>
          {info && <InfoTip label={t("about", { label })}>{info}</InfoTip>}
        </CardDescription>
        {/* Proportional figures: a hero number reads on its own, and Geist's tabular 1 has a slab foot. */}
        <CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle>
        {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  )
}

// Columns by how many cards there are, so a row never leaves a single card behind.
const statColumns: Record<number, string> = {
  2: "@xs:grid-cols-2",
  3: "@lg:grid-cols-3",
  4: "@xs:grid-cols-2 @3xl:grid-cols-4"
}

// Stat cards side by side, as wide as the space allows. Cards in a row share its height.
export function StatGrid({ children }: { children: React.ReactNode }) {
  const count = Children.toArray(children).length
  return (
    <div className="@container">
      <div className={cn("grid gap-4", statColumns[count] ?? "@xs:grid-cols-2 @3xl:grid-cols-3")}>{children}</div>
    </div>
  )
}
