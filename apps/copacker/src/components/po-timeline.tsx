import { money, type OrderInput } from "@repo/aisle"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { TimelineComment } from "./timeline-comment"

export type TimelineEntry = {
  key: string
  at: Date
  message: string
  comment: boolean
  author: string | null
  authorOrg: string | null
  revision: OrderInput | null
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
    >
      {initials(name)}
    </span>
  )
}

// A PO's timeline, like Shopify's: a comment box, then what happened, newest first and grouped by day. Comments show
// who wrote them, with their workspace when it's another company's.
export function PoTimeline({
  orderId,
  viewer,
  viewerOrg,
  timeZone,
  entries
}: {
  orderId: string
  viewer: string
  viewerOrg: string
  timeZone?: string
  entries: TimelineEntry[]
}) {
  const day = (at: Date) =>
    at.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" })
  const time = (at: Date) => at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
  const days = entries.reduce<{ day: string; entries: TimelineEntry[] }[]>((groups, entry) => {
    const label = day(entry.at)
    const last = groups.at(-1)
    if (last?.day === label) {
      last.entries.push(entry)
    } else {
      groups.push({ day: label, entries: [entry] })
    }
    return groups
  }, [])
  return (
    <section aria-labelledby="timeline" className="flex flex-col gap-4">
      <h2 id="timeline" className="font-semibold">
        Timeline
      </h2>
      <div className="flex gap-3">
        <Avatar name={viewer} />
        <div className="min-w-0 flex-1">
          <TimelineComment orderId={orderId} />
        </div>
      </div>
      <div className="relative flex flex-col gap-5 pl-10">
        <span aria-hidden className="absolute top-1 bottom-1 left-[0.8125rem] w-0.5 bg-border" />
        {days.map((group) => (
          <div key={group.day} className="flex flex-col gap-3">
            <h3 className="text-xs font-medium text-muted-foreground">{group.day}</h3>
            <ol className="flex flex-col gap-3">
              {group.entries.map((entry) => (
                <li key={entry.key} className="relative">
                  {entry.comment ? (
                    <div className="-ml-10 flex gap-3">
                      <Avatar name={entry.author ?? "?"} />
                      <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3 py-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium">
                            {entry.author}
                            {entry.authorOrg && entry.authorOrg !== viewerOrg && (
                              <span className="font-normal text-muted-foreground"> at {entry.authorOrg}</span>
                            )}
                          </p>
                          <time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.at.toISOString()}>
                            {time(entry.at)}
                          </time>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line">{entry.message}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span
                        aria-hidden
                        className="absolute top-1.5 -left-[1.9375rem] size-2.5 rounded-full border-2 border-background bg-muted-foreground/50"
                      />
                      <div className="flex items-start justify-between gap-3">
                        <EventText entry={entry} />
                        <time
                          className="shrink-0 pt-0.5 text-xs text-muted-foreground"
                          dateTime={entry.at.toISOString()}
                        >
                          {time(entry.at)}
                        </time>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}

// An event's text; a revision opens to show the lines it had.
function EventText({ entry }: { entry: TimelineEntry }) {
  if (!entry.revision) {
    return <p className="min-w-0 flex-1">{entry.message}</p>
  }
  const { revision } = entry
  return (
    <Collapsible className="min-w-0 flex-1">
      <CollapsibleTrigger className="group flex items-center gap-1 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {entry.message}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-1 pt-1.5 text-xs text-muted-foreground">
          {revision.items.map((item) => (
            <li key={item.id}>
              {item.buyerSku}: {item.pieces} units at {money(item.unitPrice, revision.currency)}
              {item.supplierSku && `, supplier SKU ${item.supplierSku}`}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
