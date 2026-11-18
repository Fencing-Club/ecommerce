import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@buildkitgg/shadcn"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { Children } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { InfoTip } from "@/components/info-tip"
import { type StatusTone, toneBadge } from "@/lib/tone"
import { cn } from "@/lib/utils"

// The KPI cards, apart from the rest of @/components/common: their info tips bring Base UI's tooltip, which a client
// component that only needs a status badge from common shouldn't download.

// A KPI. Every card has the same parts in the same places, so a row of them lines up: the label on one line, the
// figure, a note (its change against the compared period, or a short note), and anything under that, such as its trend.
export function StatCard({
  label,
  value,
  info,
  loss = false,
  note,
  children
}: {
  label: string
  value: React.ReactNode
  // What the figure means, behind an info icon after the label.
  info?: React.ReactNode
  // A loss reads in red.
  loss?: boolean
  // The line under the figure. Pass null to keep its space in a row where other cards have one.
  note?: React.ReactNode
  // Anything under the note, such as a sparkline.
  children?: React.ReactNode
}) {
  const t = useTranslations("common")
  return (
    // Two cards a row on a phone pad less, so each label still fits.
    <Card className="@container gap-3 @max-sm/stats:[--card-spacing:--spacing(3)]">
      <CardHeader className="grid-cols-1 gap-1">
        <CardDescription className="flex min-w-0 items-center gap-1.5">
          <span className="truncate" title={label}>
            {label}
          </span>
          {info && <InfoTip label={t("about", { label })}>{info}</InfoTip>}
        </CardDescription>
        {/* Proportional figures: a hero number reads on its own, and Geist's tabular 1 has a slab foot. */}
        <CardTitle
          className={cn("truncate text-2xl leading-8 font-semibold tracking-tight", loss && "text-destructive")}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {(note !== undefined || children) && (
        <CardContent className="flex flex-1 flex-col justify-end gap-3">
          {note !== undefined && (
            <div className="flex h-5 min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{note}</div>
          )}
          {children}
        </CardContent>
      )}
    </Card>
  )
}

function deltaTone(value: number | null): StatusTone & keyof typeof deltaIcons {
  if (value === null) {
    return "success"
  }
  if (Math.abs(value) < 0.005) {
    return "neutral"
  }
  return value > 0 ? "success" : "destructive"
}

const deltaIcons = { success: ArrowUpRight, destructive: ArrowDownRight, neutral: Minus }

// A change as a small pill: green up, red down, grey under half a percent either way. Null reads as new, for something
// that had nothing before.
export function DeltaPill({ value, title }: { value: number | null; title?: string }) {
  const t = useTranslations("overview")
  const format = useFormatter()
  const tone = deltaTone(value)
  const Icon = deltaIcons[tone]
  return (
    <Badge
      variant="secondary"
      data-tone={tone}
      title={title}
      className={cn(toneBadge(tone), "gap-0.5 px-1.5 tabular-nums")}
    >
      <Icon aria-hidden />
      {value === null
        ? t("new")
        : format.number(value, {
            style: "percent",
            maximumFractionDigits: Math.abs(value) < 0.1 ? 1 : 0,
            signDisplay: "exceptZero"
          })}
    </Badge>
  )
}

// A card's change against the compared period: the pill, then what it's compared with, which shows beside the pill when
// the card has room for it and is always read out.
export function DeltaNote({ value, versus }: { value: number; versus: string }) {
  return (
    <>
      <DeltaPill value={value} title={versus} />
      <span className="sr-only @min-[15rem]:not-sr-only">
        <span className="whitespace-nowrap">{versus}</span>
      </span>
    </>
  )
}

// Columns by how many cards there are, so a row never leaves a single card behind. Four and six cards stay two a row
// on a phone.
const statColumns: Record<number, string> = {
  2: "@xs/stats:grid-cols-2",
  3: "@lg/stats:grid-cols-3",
  4: "grid-cols-2 @4xl/stats:grid-cols-4",
  6: "grid-cols-2 @xl/stats:grid-cols-3 @6xl/stats:grid-cols-6"
}

// Stat cards side by side, as wide as the space allows. Cards in a row share its height. `label` names the row as a
// region, such as the period its figures cover.
export function StatGrid({ label, children }: { label?: string; children: React.ReactNode }) {
  const count = Children.toArray(children).length
  const grid = (
    <div className={cn("grid gap-4", statColumns[count] ?? "@xs/stats:grid-cols-2 @3xl/stats:grid-cols-3")}>
      {children}
    </div>
  )
  return label ? (
    <section className="@container/stats" aria-label={label}>
      {grid}
    </section>
  ) : (
    <div className="@container/stats">{grid}</div>
  )
}
