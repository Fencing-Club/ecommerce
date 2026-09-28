"use client"

import { Popover } from "@base-ui/react/popover"
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  type Comparison,
  type DayRange,
  type PresetKey,
  periodQuery,
  presetGroups,
  presetRange,
  rangeLabel
} from "@/lib/date-range"
import { addDays, addMonths } from "@/lib/time-zone"
import { cn } from "@/lib/utils"
import { DateInput } from "./form-controls"

type Selection = { key: PresetKey | "custom"; range: DayRange }
export type PickerPeriod = Selection & {
  label: string
  comparison: Comparison
  comparisonLabel: string
  previousLabel: string | null
  today: string
}

// A week of days from Sunday, for naming the calendar's columns in the reader's language.
const week = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2026, 8, 20 + index)))
// A preset in the list beside the calendar; the chosen one is shaded.
const presetClass =
  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:font-medium"
const divider = <div aria-hidden className="my-1 h-px bg-border" />

// A period's name in the reader's language: its preset, or its range of days.
function usePeriodLabel() {
  const t = useTranslations("overview.period")
  const locale = useLocale()
  return (period: Pick<Selection, "key" | "range">) =>
    period.key === "custom" ? rangeLabel(period.range, locale) : t(`presets.${period.key}`)
}

// Opens the Overview on another period or comparison, keeping the channel.
function useNavigate() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return (next: Pick<PickerPeriod, "key" | "range" | "comparison">) => {
    const query = periodQuery(next)
    const channel = params.get("channel")
    if (channel) {
      query.set("channel", channel)
    }
    const search = query.toString()
    router.push(search ? `${pathname}?${search}` : pathname)
  }
}

// The period every sales figure on the Overview covers, like Shopify's analytics: a preset relative to today in the
// store's time zone, or any range picked on the calendar. The change applies on Apply.
export function PeriodPicker({ period }: { period: PickerPeriod }) {
  const t = useTranslations("overview.period")
  const format = useFormatter()
  const periodLabel = usePeriodLabel()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Selection>(period)
  // Which list of presets shows: the main one, or the "Last" or "Period to date" group.
  const [group, setGroup] = useState<"main" | "last" | "toDate">("main")
  const [month, setMonth] = useState(period.range.to.slice(0, 7))
  // The first day picked on the calendar, while the second is awaited.
  const [anchor, setAnchor] = useState<string | null>(null)

  const reset = () => {
    setDraft(period)
    setGroup("main")
    setMonth(period.range.to.slice(0, 7))
    setAnchor(null)
  }
  const choosePreset = (key: PresetKey) => {
    const range = presetRange(key, period.today)
    setDraft({ key, range })
    setMonth(range.to.slice(0, 7))
    setAnchor(null)
  }
  const chooseDay = (day: string) => {
    if (!anchor) {
      setAnchor(day)
      setDraft({ key: "custom", range: { from: day, to: day } })
      return
    }
    setDraft({ key: "custom", range: anchor <= day ? { from: anchor, to: day } : { from: day, to: anchor } })
    setAnchor(null)
  }
  const typeDate = (end: "from" | "to", value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > period.today) {
      return
    }
    const range = { ...draft.range, [end]: value }
    setDraft({ key: "custom", range: range.from <= range.to ? range : { from: range.to, to: range.from } })
    setMonth(value.slice(0, 7))
    setAnchor(null)
  }

  const monthLabel = (month: string) =>
    format.dateTime(new Date(`${month}-01T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" })
  const presetButton = (option: { key: PresetKey }) => (
    <button
      key={option.key}
      type="button"
      className={presetClass}
      aria-pressed={draft.key === option.key}
      onClick={() => choosePreset(option.key)}
    >
      {t(`presets.${option.key}`)}
    </button>
  )
  const groupButton = (key: "last" | "toDate", label: string) => (
    <button
      type="button"
      className={presetClass}
      aria-pressed={presetGroups[key].some((option) => option.key === draft.key)}
      onClick={() => setGroup(key)}
    >
      {label}
      <ChevronRight aria-hidden size={16} className="rtl:rotate-180" />
    </button>
  )

  // The days shown for the month, with blanks before the first so it starts on its weekday.
  const first = `${month}-01`
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay()
  const length = Number(addDays(`${addMonths(month, 1)}-01`, -1).slice(8, 10))
  const days = Array.from({ length }, (_, index) => addDays(first, index))

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          reset()
        }
        setOpen(next)
      }}
    >
      <Popover.Trigger render={<Button variant="outline" />}>
        <CalendarDays data-icon="inline-start" className="text-muted-foreground" />
        {periodLabel(period)}
        <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
      </Popover.Trigger>
      {/* The picker sits at the page's end edge, so the popup lines up with its end. */}
      <Popover.Portal>
        <Popover.Positioner className="isolate z-50 outline-none" side="bottom" align="end" sideOffset={4}>
          <Popover.Popup
            aria-label={t("choose")}
            className="grid max-h-(--available-height) max-w-[calc(100vw-1rem)] origin-(--transform-origin) grid-cols-1 overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 sm:grid-cols-[11rem_minmax(0,1fr)]"
          >
            <div className="flex flex-col gap-0.5 border-b p-2 sm:border-e sm:border-b-0">
              {group === "main" ? (
                <>
                  {presetGroups.single.map(presetButton)}
                  {divider}
                  {groupButton("last", t("last"))}
                  {groupButton("toDate", t("toDate"))}
                  {divider}
                  <button
                    type="button"
                    className={presetClass}
                    aria-pressed={draft.key === "custom"}
                    onClick={() => setDraft({ key: "custom", range: draft.range })}
                  >
                    {t("custom")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={cn(presetClass, "justify-start font-medium text-muted-foreground")}
                    onClick={() => setGroup("main")}
                  >
                    <ArrowLeft aria-hidden size={16} className="rtl:rotate-180" />
                    {group === "last" ? t("last") : t("toDate")}
                  </button>
                  {presetGroups[group].map(presetButton)}
                </>
              )}
            </div>
            <div className="flex flex-col gap-3 p-3">
              <div className="flex items-center gap-2">
                <DateInput
                  className="flex-1"
                  aria-label={t("startDate")}
                  value={draft.range.from}
                  max={period.today}
                  onChange={(event) => typeDate("from", event.target.value)}
                />
                <ArrowRight className="size-4 shrink-0 rtl:rotate-180 text-muted-foreground" aria-hidden />
                <DateInput
                  className="flex-1"
                  aria-label={t("endDate")}
                  value={draft.range.to}
                  max={period.today}
                  onChange={(event) => typeDate("to", event.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("previousMonth")}
                  onClick={() => setMonth(addMonths(month, -1))}
                >
                  <ChevronLeft className="rtl:rotate-180" />
                </Button>
                <span className="text-sm font-semibold" aria-live="polite">
                  {monthLabel(month)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("nextMonth")}
                  disabled={month >= period.today.slice(0, 7)}
                  onClick={() => setMonth(addMonths(month, 1))}
                >
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-y-0.5 text-center" role="grid" aria-label={monthLabel(month)}>
                {week.map((day) => (
                  <span key={day.getUTCDay()} className="py-1 text-xs text-muted-foreground" aria-hidden>
                    {format.dateTime(day, { weekday: "short", timeZone: "UTC" })}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, index) => (
                  <span key={`blank-${index}`} />
                ))}
                {days.map((day) => {
                  // The range's first and last days are filled; the days between are shaded and join up.
                  const edge = day === draft.range.from || day === draft.range.to
                  const between = !edge && day > draft.range.from && day < draft.range.to
                  return (
                    <button
                      key={day}
                      type="button"
                      className={cn(
                        "h-9 min-w-9 rounded-md text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:text-muted-foreground/50",
                        edge && "bg-foreground font-semibold text-background",
                        between && "rounded-none bg-muted",
                        !edge && "enabled:hover:bg-accent enabled:hover:text-accent-foreground"
                      )}
                      disabled={day > period.today}
                      aria-pressed={edge}
                      aria-label={format.dateTime(new Date(`${day}T00:00:00Z`), {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC"
                      })}
                      onClick={() => chooseDay(day)}
                    >
                      {format.number(Number(day.slice(8, 10)))}
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setOpen(false)
                    navigate({ ...draft, comparison: period.comparison })
                  }}
                >
                  {t("apply")}
                </Button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
