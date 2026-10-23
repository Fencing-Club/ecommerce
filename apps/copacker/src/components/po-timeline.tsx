import {
  Avatar,
  AvatarFallback,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import type { OrderInput } from "@repo/copacker-orders"
import { money } from "@repo/copacker-orders"
import { ChevronDown, Lock, Users } from "lucide-react"
import { useId, type ReactNode } from "react"
import { useFormatter, useLocale, useTranslations } from "use-intl"
import { initials } from "@/lib/initials"
import type { TimelineEvent } from "@/lib/timeline-events"
import { cn } from "@/lib/utils"
import { TimelineComment, type PostedComment } from "./timeline-comment"

export type TimelineEntry = {
  key: string
  at: Date
  // What happened, read in the reader's language; or a comment as its author wrote it, or an event recorded as English
  // text before events had keys. A revision's is its reason.
  content: TimelineEvent | string
  comment: boolean
  author: string | null
  authorOrg: string | null
  visibility?: "internal" | "shared"
  revision: OrderInput | null
  // A revision's number; the first one is the PO being created, which needs no number.
  revisionNumber: number | null
  details?: ReactNode
}

// A comment's author. The avatar is positioned, so it paints over the timeline's line.
function AuthorAvatar({ name }: { name: string }) {
  return (
    <Avatar aria-hidden className="size-7">
      <AvatarFallback className="bg-orange-50 dark:bg-orange-950 text-xs font-semibold text-primary">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

// Hides the timeline's line below the last stop. It comes before the stop's dot or avatar, which paint over it.
function LineEnd({ className }: { className: string }) {
  return <span aria-hidden className={cn("absolute bottom-0 -start-7 w-1 bg-background", className)} />
}

// Hides the line above the first stop when there's no comment box: from the top of the day's heading (1rem tall, then
// a 0.75rem gap) down to the stop's centre.
function LineStart({ className }: { className: string }) {
  return <span aria-hidden className={cn("absolute -top-7 -start-7 w-1 bg-background", className)} />
}

// A PO's timeline, like Shopify's: a comment box, then what happened, newest first and grouped by day. Comments show
// who wrote them, with their workspace when it's another company's. One line runs from the box's bottom edge through
// every stop to the last one: it's drawn behind the opaque box and hidden below the last stop. A closed PO has no box,
// so its line starts at the first stop.
export function PoTimeline({
  orderId,
  viewerOrg,
  timeZone,
  entries,
  prices,
  commentable = true,
  counterparty = "supplier",
  onCommentPosted
}: {
  orderId: string
  viewerOrg: string
  timeZone?: string
  entries: TimelineEntry[]
  // Whether a revision's lines show their prices.
  prices: boolean
  // Whether the comment box shows; a closed PO takes no comments.
  commentable?: boolean
  counterparty?: "supplier" | "customer"
  onCommentPosted?: (comment: PostedComment) => void
}) {
  const titleId = useId()
  const locale = useLocale(),
    t = useTranslations("orders.timeline"),
    eventText = useEventTranslator()
  const sharedLabel = counterparty === "supplier" ? "comment.sharedSupplier" : "comment.sharedCustomer"
  const day = (at: Date) => at.toLocaleDateString(locale, { timeZone, month: "long", day: "numeric", year: "numeric" })
  const time = (at: Date) => at.toLocaleTimeString(locale, { timeZone, hour: "numeric", minute: "2-digit" })
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
  const firstEntry = entries[0],
    lastEntry = entries.at(-1)
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 text-sm">
      <h2 id={titleId} className="font-semibold">
        {t("title")}
      </h2>
      <div className="relative flex flex-col gap-4">
        {entries.length > 0 && <span aria-hidden className="absolute inset-y-0 start-3.25 w-0.5 bg-border" />}
        {commentable && <TimelineComment orderId={orderId} counterparty={counterparty} onPosted={onCommentPosted} />}
        {days.length > 0 && (
          <div className="flex flex-col gap-5">
            {days.map((group) => (
              <div key={group.day} className="flex flex-col gap-3 ps-10">
                <h3 className="text-xs font-medium text-muted-foreground">{group.day}</h3>
                <ol className="flex flex-col gap-3">
                  {group.entries.map((entry) => (
                    <li key={entry.key} className="relative">
                      {/* The line stops at the last stop's centre: its avatar's, or its dot's. */}
                      {entry === lastEntry && <LineEnd className={entry.comment ? "top-3.5" : "top-2.75"} />}
                      {!commentable && entry === firstEntry && (
                        <LineStart className={entry.comment ? "h-10.5" : "h-9.75"} />
                      )}
                      {entry.comment ? (
                        <div className="-ms-10 flex gap-3">
                          <AuthorAvatar name={entry.author ?? "?"} />
                          <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3 py-2">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <p className="font-medium">
                                {entry.author}
                                {entry.authorOrg && entry.authorOrg !== viewerOrg && (
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    {t("atOrg", { org: entry.authorOrg })}
                                  </span>
                                )}
                              </p>
                              <time
                                className="shrink-0 text-xs text-muted-foreground"
                                dateTime={entry.at.toISOString()}
                              >
                                {time(entry.at)}
                              </time>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap wrap-anywhere">{eventText(entry.content)}</p>
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                              {entry.visibility === "internal" ? (
                                <Lock className="size-3.5" />
                              ) : (
                                <Users className="size-3.5" />
                              )}
                              {t(entry.visibility === "internal" ? "comment.internal" : sharedLabel)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span
                            aria-hidden
                            className="absolute top-1.5 -start-[1.9375rem] size-2.5 rounded-full border-2 border-background bg-muted-foreground"
                          />
                          <div className="flex items-start justify-between gap-3">
                            <EventText
                              text={
                                entry.revisionNumber && entry.revisionNumber > 1
                                  ? t("revision", { number: entry.revisionNumber, reason: eventText(entry.content) })
                                  : eventText(entry.content)
                              }
                              details={entry.details}
                              lines={entry.revision?.items.map((item) => {
                                const values = { sku: item.buyerSku, count: item.pieces }
                                const supplierSku = item.supplierSku
                                if (!prices) {
                                  return {
                                    key: item.id,
                                    text: supplierSku
                                      ? t("revisionLineNoPriceWithSupplierSku", { ...values, supplierSku })
                                      : t("revisionLineNoPrice", values)
                                  }
                                }
                                const priced = {
                                  ...values,
                                  price: money(item.unitPrice, entry.revision!.currency, locale)
                                }
                                return {
                                  key: item.id,
                                  text: supplierSku
                                    ? t("revisionLineWithSupplierSku", { ...priced, supplierSku })
                                    : t("revisionLine", priced)
                                }
                              })}
                            />
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
        )}
      </div>
    </section>
  )
}

// An event in the reader's language, with what it names (a note, a reason, a carrier) as written. Text, such as a
// comment, shows as written.
function useEventTranslator() {
  const t = useTranslations("orders.timeline.events"),
    format = useFormatter()
  return (content: TimelineEvent | string) => {
    if (typeof content === "string") {
      return content
    }
    switch (content.key) {
      case "readyDateSet":
        return t("readyDateSet", {
          date: format.dateTime(new Date(`${content.values.date}T00:00:00Z`), {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC"
          })
        })
      case "packingSplit":
        return t("packingSplit", { networks: format.list(content.values.networks) })
      case "changesProposedWithNote":
      case "changesDeclinedWithReason":
      case "correctionRequested":
      case "supplierChangesApproved":
      case "invoiceChangesApproved":
      case "packingQueued":
      case "forwarderShipped":
        return t(content.key, content.values)
      default:
        return t(content.key)
    }
  }
}

// An event's text; a revision opens to show the lines it had.
function EventText({
  text,
  lines,
  details
}: {
  text: string
  lines: Array<{ key: string; text: string }> | undefined
  details?: ReactNode
}) {
  if (!lines && !details) {
    return <p className="min-w-0 flex-1">{text}</p>
  }
  return (
    <Collapsible className="min-w-0 flex-1">
      <CollapsibleTrigger className="focus-ring group flex items-center gap-1 rounded-sm text-start">
        {text}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {details}
        <ul className="flex flex-col gap-1 pt-1.5 text-xs text-muted-foreground">
          {lines?.map((line) => (
            <li key={line.key}>{line.text}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
