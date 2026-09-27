"use client"

import { Popover } from "@base-ui/react/popover"
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  type Comparison,
  type DayRange,
  type PresetKey,
  periodQuery,
  presetGroups,
  presetRange
} from "@/lib/date-range"
import { addDays, addMonths } from "@/lib/time-zone"
import * as styles from "./period-picker.css"

type Selection = { key: PresetKey | "custom"; range: DayRange }
export type PickerPeriod = Selection & {
  label: string
  comparison: Comparison
  comparisonLabel: string
  previousLabel: string | null
  today: string
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })

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

  const presetButton = (option: { key: PresetKey; label: string }) => (
    <button
      key={option.key}
      type="button"
      className={styles.preset}
      aria-pressed={draft.key === option.key}
      onClick={() => choosePreset(option.key)}
    >
      {option.label}
    </button>
  )
  const groupButton = (key: "last" | "toDate", label: string) => (
    <button
      type="button"
      className={styles.preset}
      aria-pressed={presetGroups[key].some((option) => option.key === draft.key)}
      onClick={() => setGroup(key)}
    >
      {label}
      <ChevronRight aria-hidden size={16} />
    </button>
  )

  // The days shown for the month, with blanks before the first so it starts on its weekday.
  const first = `${month}-01`
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay()
  const length = Number(addDays(`${addMonths(month, 1)}-01`, -1).slice(8, 10))
  const days = Array.from({ length }, (_, index) => addDays(first, index))

  return (
    <div className={styles.controls}>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (next) {
            reset()
          }
          setOpen(next)
        }}
      >
        <Popover.Trigger render={<Button variant="outline" size="sm" />}>
          <CalendarDays data-icon="inline-start" />
          {period.label}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className={styles.positioner} side="bottom" align="start" sideOffset={4}>
            <Popover.Popup className={styles.popup} aria-label="Choose a period">
              <div className={styles.presets}>
                {group === "main" ? (
                  <>
                    {presetGroups.single.map(presetButton)}
                    <div className={styles.presetDivider} />
                    {groupButton("last", "Last")}
                    {groupButton("toDate", "Period to date")}
                    <div className={styles.presetDivider} />
                    <button
                      type="button"
                      className={styles.preset}
                      aria-pressed={draft.key === "custom"}
                      onClick={() => setDraft({ key: "custom", range: draft.range })}
                    >
                      Custom range
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={styles.presetHeading} onClick={() => setGroup("main")}>
                      <ArrowLeft aria-hidden size={16} />
                      {group === "last" ? "Last" : "Period to date"}
                    </button>
                    {presetGroups[group].map(presetButton)}
                  </>
                )}
              </div>
              <div className={styles.panel}>
                <div className={styles.dates}>
                  <input
                    type="date"
                    className={styles.dateInput}
                    aria-label="Start date"
                    value={draft.range.from}
                    max={period.today}
                    onChange={(event) => typeDate("from", event.target.value)}
                  />
                  <ArrowRight className={styles.arrow} aria-hidden />
                  <input
                    type="date"
                    className={styles.dateInput}
                    aria-label="End date"
                    value={draft.range.to}
                    max={period.today}
                    onChange={(event) => typeDate("to", event.target.value)}
                  />
                </div>
                <div className={styles.monthHeader}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Previous month"
                    onClick={() => setMonth(addMonths(month, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <span className={styles.monthName} aria-live="polite">
                    {monthLabel(month)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Next month"
                    disabled={month >= period.today.slice(0, 7)}
                    onClick={() => setMonth(addMonths(month, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>
                <div className={styles.calendar} role="grid" aria-label={monthLabel(month)}>
                  {weekdays.map((name) => (
                    <span key={name} className={styles.weekday} aria-hidden>
                      {name}
                    </span>
                  ))}
                  {Array.from({ length: lead }, (_, index) => (
                    <span key={`blank-${index}`} />
                  ))}
                  {days.map((day) => {
                    const edge = day === draft.range.from || day === draft.range.to
                    return (
                      <button
                        key={day}
                        type="button"
                        className={styles.day}
                        disabled={day > period.today}
                        data-edge={edge}
                        data-in-range={!edge && day > draft.range.from && day < draft.range.to}
                        aria-pressed={edge}
                        aria-label={new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC"
                        })}
                        onClick={() => chooseDay(day)}
                      >
                        {Number(day.slice(8, 10))}
                      </button>
                    )
                  })}
                </div>
                <div className={styles.footer}>
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setOpen(false)
                      navigate({ ...draft, comparison: period.comparison })
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
