import { ExternalLink, Info, Tags, Truck, Warehouse } from "lucide-react"
import { useId, useState } from "react"
import { useFormatter, useLocale, useTimeZone, useTranslations } from "use-intl"
import { SelectControl } from "@/components/form-select"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { BookingDialog, type BookingDialogState, BookingStep, DoneAction } from "./booking-dialog"
import { FileRow, LabelsRow, RowStatus } from "./file-row"
import { IssueSummary, IssuesView } from "./issues"
import { OptionList } from "./option-list"
import { SummaryList } from "./summary-list"

// A carrier's quote to take the shipment. `name` is its service as Amazon names it, such as "Amass standard truck",
// `service` and `mode` the same in parts. `shipping` is Amazon's charge for it, without the placement fee.
export type FbaQuote = { id: string; carrier: string; name: string; service: string; mode: string; shipping: number }

// Where Amazon would send the shipment, one warehouse or a split across several, its placement fee, and the carriers'
// quotes for it, cheapest first.
export type FbaPlacement = {
  id: string
  warehouses: Array<{ code: string; place: string }>
  placementFee: number
  quotes: FbaQuote[]
}

// A problem Amazon flagged before quoting, worded here: cartons too small for what they hold, or a product not yet
// eligible for FBA.
export type FbaIssue = { kind: "cartonVolume"; first: number; last: number } | { kind: "notEligible"; product: string }

// Amazon's shipping options: the placements, held at their prices until `heldUntil`, or why there are none to show.
export type FbaOptions =
  | { status: "ready"; placements: FbaPlacement[]; heldUntil: Date; expired: boolean }
  | { status: "reconnect" }
  | { status: "failed" }
  | { status: "issues"; issues: FbaIssue[] }

export type FbaLabels = { status: "pending" } | { status: "ready"; href: string }

export type FbaMethod = "smallParcel" | "lessThanTruckload" | "fullTruckload"

const methods: FbaMethod[] = ["smallParcel", "lessThanTruckload", "fullTruckload"]

function isMethod(value: string | undefined): value is FbaMethod {
  return methods.some((method) => method === value)
}

// What the buyer books: one of a placement's quotes, or their own carrier.
export type FbaChoice =
  | { placementId: string; quoteId: string }
  | { placementId: string; ownCarrier: { method: FbaMethod; carrier: string; windowId: string } }

// Everything the FBA booking shows, as the server knows it.
export type FbaBooking = {
  // The shipment's name, such as "Shipment 2", where the labels are kept.
  shipment: string
  currency: string
  pickup: { place: string; ready: Date }
  options: FbaOptions
  // What booking your own carrier asks for: its carrier, and one of Amazon's delivery windows.
  ownCarrier: { carriers: string[]; windows: Array<{ id: string; start: Date; end: Date }> }
  termsUrl: string
  booked: {
    place: string
    service: string
    total: number
    amazonLabels: { status: "pending" } | { status: "ready"; href: string; count: number }
    // The carrier's labels, which your own carrier doesn't send.
    carrierLabels: { carrier: string; labels: FbaLabels } | null
  } | null
}

export type FbaStep = "choose" | "review"

type Screen = "choose" | "carrier" | "own" | "review"

// Your own carrier's details, as the buyer fills them in.
type Own = { method: FbaMethod; carrier: string; windowId: string | null }

// Booking FBA transport through Amazon: where Amazon places the shipment and which carrier takes it are one decision,
// made on one screen that starts on the lowest total, then reviewed and booked. Your own carrier is one more option. It
// reopens where the buyer left off (`initialStep`); a booked shipment shows whatever the step. Every button does one
// thing, through the callbacks.
export function FbaBookingDialog({
  booking,
  initialStep = "choose",
  onReconnect,
  onRetry,
  onCheckAgain,
  onFix,
  onRefreshPrices,
  onBook,
  ...dialog
}: BookingDialogState & {
  booking: FbaBooking
  initialStep?: FbaStep
  onReconnect: () => void
  onRetry: () => void
  onCheckAgain: () => void
  onFix: (issue: FbaIssue) => void
  onRefreshPrices: () => void
  onBook: (choice: FbaChoice) => void
}) {
  const t = useTranslations("booking")
  const format = useFormatter()
  const id = useId()
  const [screen, setScreen] = useState<Screen>(initialStep)
  const [reviewing, setReviewing] = useState(false)
  const [chosenPlacement, setPlacement] = useState<string | null>(null)
  // Each placement's carrier, once the buyer changes it from the cheapest: a quote's id, or "own".
  const [carriers, setCarriers] = useState<Record<string, string>>({})
  // The carrier being chosen, before Use this carrier.
  const [draft, setDraft] = useState<string | null>(null)
  const [own, setOwn] = useState<Own>({
    method: "smallParcel",
    carrier: booking.ownCarrier.carriers[0] ?? "",
    windowId: null
  })
  const { options } = booking
  const locale = useLocale()
  const timeZone = useTimeZone()
  const money = (amount: number) => format.number(amount, { style: "currency", currency: booking.currency })
  // The zone by its generic name, PT rather than PDT, which use-intl's formatter doesn't offer.
  const time = (date: Date) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "shortGeneric",
      timeZone
    }).format(date)
  const back = (to: Screen) => (
    <Button
      variant="outline"
      onClick={() => {
        setDraft(null)
        setScreen(to)
      }}
    >
      {t("back")}
    </Button>
  )

  if (booking.booked) {
    return (
      <BookingDialog {...dialog} screen="booked">
        <Booked booking={booking} booked={booking.booked} money={money} />
      </BookingDialog>
    )
  }

  if (options.status === "issues" && reviewing) {
    return (
      <BookingDialog {...dialog} screen="issues">
        <IssuesView
          title={t("fba.packingIssues.title", { count: options.issues.length })}
          description={t("fba.packingIssues.description")}
          issues={options.issues.map((issue) =>
            issue.kind === "cartonVolume"
              ? {
                  id: `cartons-${issue.first}-${issue.last}`,
                  where:
                    issue.first === issue.last
                      ? t("fba.packingIssues.carton", { number: issue.first })
                      : t("fba.packingIssues.cartons", { first: issue.first, last: issue.last }),
                  what: t("fba.packingIssues.cartonVolume"),
                  fix: { label: t("fba.packingIssues.editCartons"), onFix: () => onFix(issue) }
                }
              : { id: `eligible-${issue.product}`, where: issue.product, what: t("fba.packingIssues.notEligible") }
          )}
          step={{ current: 1, total: 2 }}
          onBack={() => setReviewing(false)}
          onCheckAgain={onCheckAgain}
        />
      </BookingDialog>
    )
  }

  if (options.status !== "ready") {
    // Nothing to choose until the problem is dealt with, so it shows where the options would.
    return (
      <BookingDialog {...dialog} screen="choose">
        <BookingStep
          title={t("fba.choose.title")}
          description={t("fba.choose.description")}
          step={{ current: 1, total: 2 }}
          actions={<Button disabled>{t("continue")}</Button>}
        >
          {options.status === "reconnect" && (
            <IssueSummary
              title={t("fba.problems.reconnect")}
              description={t("fba.problems.reconnectDescription")}
              action={t("fba.problems.reconnectAction")}
              onAction={onReconnect}
            />
          )}
          {options.status === "failed" && (
            <IssueSummary
              title={t("fba.problems.failed")}
              description={t("fba.problems.failedDescription")}
              action={t("tryAgain")}
              retry
              onAction={onRetry}
            />
          )}
          {options.status === "issues" && (
            <IssueSummary
              title={t("fba.packingIssues.summary", { count: options.issues.length })}
              description={t("fba.packingIssues.summaryDescription", { count: options.issues.length })}
              action={t("review")}
              onAction={() => setReviewing(true)}
            />
          )}
        </BookingStep>
      </BookingDialog>
    )
  }

  const placements = options.placements.toSorted((a, b) => total(a) - total(b))
  const placement = placements.find((candidate) => candidate.id === chosenPlacement) ?? placements[0]
  if (!placement) {
    return null
  }
  const carrierId = carriers[placement.id] ?? placement.quotes[0]?.id ?? "own"
  const quote = placement.quotes.find((candidate) => candidate.id === carrierId)
  const destination =
    placement.warehouses.length === 1 && placement.warehouses[0]
      ? placement.warehouses[0].place
      : t("fba.choose.warehouses", { count: placement.warehouses.length })
  const codes = (target: FbaPlacement) =>
    format.list(
      target.warehouses.map((warehouse) => warehouse.code),
      { type: "unit" }
    )

  if (screen === "carrier") {
    const chosen = draft ?? carrierId
    return (
      <BookingDialog {...dialog} screen="carrier">
        <BookingStep
          title={t("fba.carrier.title")}
          description={t("fba.carrier.description", { destination, fee: money(placement.placementFee) })}
          step={{ current: 1, total: 2 }}
          actions={
            <>
              {back("choose")}
              <Button
                onClick={() => {
                  setCarriers({ ...carriers, [placement.id]: chosen })
                  setDraft(null)
                  setScreen(chosen === "own" ? "own" : "choose")
                }}
              >
                {t("fba.carrier.use")}
              </Button>
            </>
          }
        >
          <OptionList
            aria-label={t("fba.carrier.title")}
            value={chosen}
            onValueChange={setDraft}
            options={[
              ...placement.quotes.map((candidate, index) => ({
                value: candidate.id,
                title: candidate.carrier,
                badge: index === 0 ? t("fba.carrier.cheapest") : undefined,
                description: t("fba.carrier.quote", { service: candidate.service, mode: candidate.mode }),
                price: money(placement.placementFee + candidate.shipping)
              })),
              {
                value: "own",
                title: t("fba.carrier.own"),
                description: t("fba.carrier.ownDescription"),
                price: money(placement.placementFee)
              }
            ]}
          />
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            {t("fba.carrier.noEstimates")}
          </p>
        </BookingStep>
      </BookingDialog>
    )
  }

  if (screen === "own") {
    return (
      <BookingDialog {...dialog} screen="own">
        <BookingStep
          title={t("fba.own.title")}
          description={t("fba.own.description", { shipment: booking.shipment })}
          step={{ current: 1, total: 2 }}
          actions={
            <>
              {back("carrier")}
              <Button disabled={!own.windowId || !own.carrier} onClick={() => setScreen("review")}>
                {t("continue")}
              </Button>
            </>
          }
          bodyClassName="gap-4"
        >
          <Field>
            <FieldLabel htmlFor={`${id}-method`}>{t("fba.own.method")}</FieldLabel>
            <SelectControl
              id={`${id}-method`}
              required
              options={methods.map((method) => ({ value: method, label: t(`fba.own.methods.${method}`) }))}
              value={own.method}
              onValueChange={(method) => isMethod(method) && setOwn({ ...own, method })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-carrier`}>{t("fba.own.carrier")}</FieldLabel>
            <SelectControl
              id={`${id}-carrier`}
              required
              options={booking.ownCarrier.carriers.map((carrier) => ({ value: carrier, label: carrier }))}
              value={own.carrier}
              onValueChange={(carrier) => carrier && setOwn({ ...own, carrier })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-window`}>{t("fba.own.window")}</FieldLabel>
            <SelectControl
              id={`${id}-window`}
              required
              placeholder={t("fba.own.windowPlaceholder")}
              options={booking.ownCarrier.windows.map((window) => ({
                value: window.id,
                label: format.dateTimeRange(window.start, window.end, { month: "short", day: "numeric" })
              }))}
              value={own.windowId}
              onValueChange={(windowId) => setOwn({ ...own, windowId: windowId ?? null })}
            />
          </Field>
        </BookingStep>
      </BookingDialog>
    )
  }

  if (screen === "review") {
    const fee = placement.placementFee
    const shipping = quote?.shipping
    const split = placement.warehouses.length > 1
    const choice = bookingChoice(placement.id, quote, own)
    const carrierDetail = quote ? quote.mode : own.carrier
    return (
      <BookingDialog {...dialog} screen="review">
        <BookingStep
          title={t("fba.review.title")}
          description={
            options.expired
              ? t("fba.review.expiredAt", { time: time(options.heldUntil) })
              : t("fba.review.heldUntil", { time: time(options.heldUntil) })
          }
          step={{ current: 2, total: 2 }}
          actions={
            <>
              {back("choose")}
              <Button disabled={options.expired || !choice} onClick={() => choice && onBook(choice)}>
                {options.expired
                  ? t("fba.review.bookUnpriced")
                  : t("fba.review.book", { total: money(fee + (shipping ?? 0)) })}
              </Button>
            </>
          }
        >
          {options.expired && (
            <IssueSummary
              title={t("fba.review.expired")}
              description={t("fba.review.expiredDescription")}
              action={t("fba.review.refresh")}
              retry
              onAction={onRefreshPrices}
            />
          )}
          <SummaryList
            items={[
              {
                label: split ? t("fba.review.warehouses") : t("fba.review.warehouse"),
                value: destination,
                detail: options.expired ? undefined : codes(placement)
              },
              {
                label: t("fba.review.carrier"),
                value: quote ? quote.name : t("fba.carrier.own"),
                detail: options.expired ? undefined : carrierDetail
              },
              ...(options.expired
                ? []
                : [
                    {
                      label: t("fba.review.pickup"),
                      value: booking.pickup.place,
                      detail: t("fba.review.ready", {
                        date: format.dateTime(booking.pickup.ready, { month: "short", day: "numeric" })
                      })
                    }
                  ]),
              { label: t("fba.review.placementFee"), value: options.expired ? "—" : money(fee) },
              {
                label: t("fba.review.shipping"),
                value: options.expired || shipping === undefined ? "—" : money(shipping)
              }
            ]}
            total={{
              label: t("fba.review.total"),
              value: options.expired ? "—" : money(fee + (shipping ?? 0))
            }}
          />
          {quote && (
            <p className="flex items-center gap-1 px-0.5 text-meta text-muted-foreground">
              {t.rich("fba.review.terms", { terms: termsLink(booking.termsUrl, t("newTab")) })}
            </p>
          )}
        </BookingStep>
      </BookingDialog>
    )
  }

  // The chosen carrier's line: your own carrier's terms, the cheapest saying so, or another's service.
  const carrierLine = () => {
    if (!quote) {
      return t("fba.carrier.ownDescription")
    }
    if (quote.id === placement.quotes[0]?.id) {
      return t("fba.choose.cheapestFor", { destination })
    }
    return t("fba.carrier.quote", { service: quote.service, mode: quote.mode })
  }

  return (
    <BookingDialog {...dialog} screen="choose">
      <BookingStep
        title={t("fba.choose.title")}
        description={t("fba.choose.description")}
        step={{ current: 1, total: 2 }}
        actions={<Button onClick={() => setScreen(carrierId === "own" ? "own" : "review")}>{t("continue")}</Button>}
      >
        <OptionList
          aria-label={t("fba.choose.title")}
          value={placement.id}
          onValueChange={setPlacement}
          options={placements.map((candidate, index) => ({
            value: candidate.id,
            title:
              candidate.warehouses.length === 1 && candidate.warehouses[0]
                ? candidate.warehouses[0].place
                : t("fba.choose.warehouses", { count: candidate.warehouses.length }),
            badge: index === 0 ? t("fba.choose.lowest") : undefined,
            description: t("fba.choose.withFee", { codes: codes(candidate), fee: money(candidate.placementFee) }),
            price: money(total(candidate))
          }))}
        />
        <FileRow
          icon={<Truck aria-hidden />}
          title={quote ? quote.name : t("fba.carrier.own")}
          description={carrierLine()}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(carrierId)
              setScreen("carrier")
            }}
          >
            {t("fba.choose.change")}
          </Button>
        </FileRow>
      </BookingStep>
    </BookingDialog>
  )
}

// What Book books: the chosen quote, or your own carrier once its delivery window is chosen.
function bookingChoice(placementId: string, quote: FbaQuote | undefined, own: Own): FbaChoice | null {
  if (quote) {
    return { placementId, quoteId: quote.id }
  }
  if (own.windowId) {
    return { placementId, ownCarrier: { method: own.method, carrier: own.carrier, windowId: own.windowId } }
  }
  return null
}

// The review's link to the carrier terms, which opens in a new tab and says so.
function termsLink(href: string, newTab: string) {
  return (chunks: React.ReactNode) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring inline-flex items-center gap-1 rounded-sm text-foreground underline-offset-4 hover:underline"
    >
      {chunks}
      <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
      <span className="sr-only">{newTab}</span>
    </a>
  )
}

// A placement's lowest total: its fee and its cheapest carrier.
function total(placement: FbaPlacement) {
  return placement.placementFee + (placement.quotes[0]?.shipping ?? 0)
}

// The booked shipment and its labels, each with its own download, waiting in place until it arrives.
function Booked({
  booking,
  booked,
  money
}: {
  booking: FbaBooking
  booked: NonNullable<FbaBooking["booked"]>
  money: (amount: number) => string
}) {
  const t = useTranslations("booking")
  const { carrierLabels } = booked
  return (
    <BookingStep
      title={t("fba.booked.title")}
      description={t("fba.booked.description", { shipment: booking.shipment })}
      actions={<DoneAction />}
    >
      <FileRow
        icon={<Warehouse aria-hidden />}
        title={booked.place}
        description={t("fba.booked.summary", { service: booked.service, total: money(booked.total) })}
      >
        <RowStatus>{t("fba.booked.booked")}</RowStatus>
      </FileRow>
      {/* Says when each file arrives. */}
      <div aria-live="polite" className="flex flex-col gap-3">
        <LabelsRow
          icon={<Tags aria-hidden />}
          title={t("fba.booked.amazonLabels")}
          from="Amazon"
          labels={booked.amazonLabels}
        />
        {carrierLabels && (
          <LabelsRow
            icon={<Truck aria-hidden />}
            title={t("fba.booked.carrierLabels")}
            from={carrierLabels.carrier}
            labels={carrierLabels.labels}
          />
        )}
      </div>
    </BookingStep>
  )
}
