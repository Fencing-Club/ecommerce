"use client"

import { Check, FileText, GlassWater, Ship } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { StatusBadge } from "@/components/common"
import { cn } from "@/lib/utils"
import type { Place, World } from "./journey-world"
import { through } from "./scroll"
import { quiet } from "./site"

// One purchase order's trip from the supplier's factory, through customs, to Amazon and the seller's own warehouse,
// played by scroll over a 3D diorama (./journey-world). The section is tall and its view is pinned, so scrolling moves
// the trip along, with the chapter's words on the left, the order's documents filling in beneath them as each is made,
// and the app's own cards pinned to the places they belong to. The world loads only as the section comes near. With
// reduced motion, the trip steps from chapter to chapter instead of moving. The points on the trip follow the world's
// beats.

type Translate = ReturnType<typeof useTranslations<"marketing.journey">>
type Format = ReturnType<typeof useFormatter>

// Each chapter's step, title and words are under marketing.journey.chapters.<key>.
const chapters = [
  { at: 0, key: "order" },
  { at: 0.1, key: "pack" },
  { at: 0.34, key: "pickUp" },
  { at: 0.48, key: "ship" },
  { at: 0.7, key: "customs" },
  { at: 0.82, key: "deliver" }
] as const

// Where each chapter's still frame sits, for reduced motion.
const stills = [0.09, 0.3, 0.47, 0.69, 0.815, 1]

// The order's documents, each saved to it at the point on the trip where it's made. The carrier issues the bill of
// lading once the container is aboard. Their names are under marketing.journey.documents.
const documents = [
  { at: 0.06, key: "purchaseOrder", file: "PO-1043.pdf" },
  { at: 0.138, key: "fnskuLabels", file: "PO-1043-fnsku-labels.pdf" },
  { at: 0.146, key: "chokingHazardLabels", file: "PO-1043-choking-hazard.pdf" },
  { at: 0.212, key: "packingList", file: "PO-1043-packing-list.pdf" },
  { at: 0.232, key: "cartonLabels", file: "PO-1043-carton-labels.pdf" },
  { at: 0.237, key: "shippingLabels", file: "PO-1043-shipping-labels.pdf" },
  { at: 0.5, key: "commercialInvoice", file: "PO-1043-invoice.pdf" },
  { at: 0.558, key: "billOfLading", file: "PO-1043-bill-of-lading.pdf" }
] as const

// A card or a pin, pinned to a place in the world, or held at `spot` on the screen when the place moves too much for a
// card to follow it.
type Note = {
  place: Place
  shown: [number, number][]
  kind: "card" | "pin"
  spot?: { x: number; y: number }
  content: (t: Translate, format: Format) => React.ReactNode
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "light w-64 rounded-2xl bg-background p-4 text-[0.8125rem] text-foreground shadow-[0_24px_48px_-20px_rgb(60_30_10/0.35),0_0_0_1px_rgb(0_0_0/0.06)]",
        className
      )}
    >
      {children}
    </div>
  )
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-3 flex flex-col">
      {rows.map(([term, value]) => (
        <div key={term} className="flex items-center justify-between gap-4 border-t py-1.5">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// What a delivery added to stock there: the product, and its units in green, like the forecast's restock.
function Arrived({ units }: { units: string }) {
  return (
    <div className="mt-3 flex items-center gap-2.5 border-t pt-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <GlassWater className="size-3.5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">Steel Bottle 32 oz</span>
      <span className="font-semibold text-success tabular-nums">+{units}</span>
    </div>
  )
}

const notes: Note[] = [
  {
    place: "order",
    kind: "card",
    shown: [[0.015, 0.1]],
    content: (t, format) => (
      <Card className="w-72">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="font-semibold">{t("purchaseOrder", { number: 1043 })}</span>
          <span className="ms-auto">
            <StatusBadge tone="info">{t("cards.withSupplier")}</StatusBadge>
          </span>
        </div>
        <Rows
          rows={[
            [t("cards.supplier"), "Shenzhen Metalworks"],
            [t("cards.units"), format.number(3180)],
            [t("cards.total"), format.number(13_650, { style: "currency", currency: "USD" })]
          ]}
        />
      </Card>
    )
  },
  { place: "stickers", kind: "pin", shown: [[0.12, 0.19]], content: (t) => t("pins.unitLabels") },
  {
    place: "fit",
    kind: "pin",
    shown: [[0.19, 0.225]],
    content: (t) => t("pins.rightSized", { size: "40 × 28 × 29 cm" })
  },
  { place: "labels", kind: "pin", shown: [[0.232, 0.265]], content: (t) => t("pins.boxLabels") },
  {
    place: "packing",
    kind: "card",
    shown: [[0.27, 0.34]],
    content: (t, format) => (
      <Card>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{t("documents.packingList")}</span>
          <span className="ms-auto">
            <StatusBadge tone="success">{t("cards.submitted")}</StatusBadge>
          </span>
        </div>
        <Rows
          rows={[
            [t("cards.cartons"), format.number(160)],
            [t("cards.cartonSize"), "40 × 28 × 29 cm"],
            [t("cards.weight"), format.number(1610, { style: "unit", unit: "kilogram" })]
          ]}
        />
      </Card>
    )
  },
  {
    place: "china",
    kind: "card",
    spot: { x: 0.86, y: 0.34 },
    shown: [[0.35, 0.465]],
    content: (t) => (
      <Card className="w-72">
        <span className="font-semibold">{t("cards.shipments")}</span>
        <Rows
          rows={[
            [t("cards.awdByAmazon"), t("cards.unitCount", { count: 1440 })],
            ["Amazon FBA", t("cards.unitCount", { count: 1260 })],
            [t("places.yourWarehouse"), t("cards.unitCount", { count: 480 })]
          ]}
        />
      </Card>
    )
  },
  {
    place: "china",
    kind: "card",
    shown: [[0.475, 0.52]],
    content: (t, format) => (
      <Card>
        <span className="font-semibold">{t("cards.checkedInAwd")}</span>
        <Arrived units={format.number(1440)} />
      </Card>
    )
  },
  {
    place: "quay",
    kind: "card",
    shown: [[0.52, 0.56]],
    content: (t, format) => (
      <Card className="w-72">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Ship className="size-4" />
          </span>
          <span className="flex flex-col leading-snug">
            <span className="font-medium">{t("cards.pickedUp", { forwarder: "Pacific Link Logistics" })}</span>
            <span className="text-muted-foreground">
              {format.dateTime(new Date(Date.UTC(2026, 9, 6, 16, 12)), {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "UTC"
              })}
            </span>
          </span>
        </div>
      </Card>
    )
  },
  {
    place: "ship",
    kind: "card",
    shown: [[0.6, 0.7]],
    content: (t, format) => (
      <Card className="w-56">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{t("cards.onTheWater")}</span>
          <span className="ms-auto">
            <StatusBadge tone="info">{t("cards.inTransit")}</StatusBadge>
          </span>
        </div>
        <Rows
          rows={[
            [
              t("cards.arrives"),
              format.dateTime(new Date(Date.UTC(2026, 10, 24)), { month: "short", day: "numeric", timeZone: "UTC" })
            ]
          ]}
        />
      </Card>
    )
  },
  {
    place: "customs",
    kind: "card",
    shown: [[0.808, 0.852]],
    content: (t, format) => (
      <Card>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{t("places.customs")}</span>
          <span className="ms-auto">
            <StatusBadge tone="success">{t("cards.released")}</StatusBadge>
          </span>
        </div>
        <Rows
          rows={[
            [t("documents.billOfLading"), "PLL204815"],
            [
              t("cards.cleared"),
              format.dateTime(new Date(Date.UTC(2026, 10, 26)), { month: "short", day: "numeric", timeZone: "UTC" })
            ]
          ]}
        />
      </Card>
    )
  },
  {
    place: "fba",
    kind: "card",
    shown: [[0.862, 0.905]],
    content: (t, format) => (
      <Card>
        <span className="font-semibold">{t("cards.checkedIn")}</span>
        <Arrived units={format.number(1260)} />
      </Card>
    )
  },
  {
    place: "yours",
    kind: "card",
    shown: [[0.94, 0.975]],
    content: (t, format) => (
      <Card>
        <span className="font-semibold">{t("cards.delivered")}</span>
        <Arrived units={format.number(480)} />
      </Card>
    )
  },
  {
    place: "factory",
    kind: "pin",
    // Not while the purchase order's card, which names the supplier, or AWD's card is up: on a phone they'd cover it.
    shown: [
      [0, 0.015],
      [0.3, 0.475],
      [0.96, 1]
    ],
    content: () => "Shenzhen Metalworks"
  },
  {
    place: "china",
    kind: "pin",
    shown: [
      [0.44, 0.475],
      [0.96, 1]
    ],
    content: (t) => t("places.awdInChina")
  },
  {
    place: "customs",
    kind: "pin",
    shown: [
      [0.7, 0.808],
      [0.96, 1]
    ],
    content: (t) => t("places.customs")
  },
  {
    place: "fba",
    kind: "pin",
    shown: [
      [0.78, 0.862],
      [0.96, 1]
    ],
    content: () => "Amazon FBA"
  },
  {
    place: "yours",
    kind: "pin",
    shown: [
      [0.8, 0.94],
      [0.975, 1]
    ],
    content: (t) => t("places.yourWarehouse")
  }
]

export function Journey() {
  const t = useTranslations("marketing.journey")
  const format = useFormatter()
  // The world paints the purchase order's name onto its page, and the customs house's sign, in the reader's language.
  const orderName = t("purchaseOrder", { number: 1043 })
  const customsSign = t("places.customs")
  const section = useRef<HTMLElement>(null)
  const surface = useRef<HTMLCanvasElement>(null)
  const pinned = useRef<(HTMLDivElement | null)[]>([])
  const [chapter, setChapter] = useState(0)
  const [saved, setSaved] = useState(0)
  const [ready, setReady] = useState(false)
  const [ending, setEnding] = useState(false)

  useEffect(() => {
    const element = section.current
    const canvas = surface.current
    if (!element || !canvas) {
      return
    }
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    const start = performance.now()
    let world: World | undefined
    let loading = false
    let near = false
    let frame = 0
    let shown = -1
    let last = start
    // Each card's size, measured once it's laid out.
    const widths: number[] = []
    const heights: number[] = []

    const layout = () => {
      const wide = innerWidth >= 1024
      // The subject sits across from the words, which start on the right in a right-to-left language.
      const rtl = getComputedStyle(canvas).direction === "rtl"
      world?.resize(
        canvas.clientWidth,
        canvas.clientHeight,
        wide ? { x: rtl ? 0.34 : 0.66, y: 0.6 } : { x: 0.5, y: 0.34 }
      )
    }
    const tick = (now: number) => {
      frame = 0
      const target = Math.min(1, Math.max(0, through(element.getBoundingClientRect(), innerHeight)))
      const step = Math.min(0.25, (now - last) / 1000)
      last = now
      if (still) {
        const index = chapters.findLastIndex((entry) => target >= entry.at)
        shown = stills[Math.max(0, index)] ?? 1
      } else {
        shown = shown < 0 ? target : shown + (target - shown) * (1 - Math.exp(-step * 5))
      }
      // A phone ends the trip at the warehouses: the whole board would be too small to read at its width.
      const wide = innerWidth >= 1024
      const played = wide ? shown : Math.min(shown, 0.95)
      if (world) {
        world.frame(played, still ? 0 : (now - start) / 1000)
        // Where the paper behind the words has all but faded: cards stay to the right of it on a wide screen.
        const clear = wide ? 0.85 * (Math.max(24, (innerWidth - 1152) / 2 + 24) + 672) : 16
        for (const [i, note] of notes.entries()) {
          const pin = pinned.current[i]
          if (!pin) {
            continue
          }
          const { x, y } = note.spot
            ? { x: note.spot.x * canvas.clientWidth, y: note.spot.y * canvas.clientHeight }
            : world.locate(note.place)
          pin.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
          pin.dataset.shown = String(note.shown.some(([from, to]) => played >= from && played <= to))
          // A card slides sideways along the top of its stem, and down below the site's header, to stay whole on
          // screen; a pin slides in from the screen's edges.
          const label = pin.lastElementChild
          if (label instanceof HTMLElement) {
            widths[i] ||= label.offsetWidth
            heights[i] ||= label.offsetHeight
            const half = (widths[i] ?? 0) / 2
            const left = (note.kind === "card" ? clear : 16) + half
            const centered = Math.max(left, Math.min(canvas.clientWidth - 16 - half, x))
            label.style.marginLeft = `${(centered - x).toFixed(1)}px`
            if (note.kind === "card") {
              label.style.marginBottom = `${Math.min(0, y - 12 - (heights[i] ?? 0) - 76).toFixed(1)}px`
            }
          }
        }
      }
      setChapter(
        Math.max(
          0,
          chapters.findLastIndex((entry) => shown >= entry.at - 0.005)
        )
      )
      setSaved(documents.filter((document) => played >= document.at).length)
      setEnding(wide && shown > 0.955)
      if (near && !still) {
        frame = requestAnimationFrame(tick)
      }
    }
    const request = () => {
      frame ||= requestAnimationFrame(tick)
    }

    const load = () => {
      loading = true
      import("./journey-world")
        .then(({ createWorld }) => {
          if (!surface.current) {
            return
          }
          world = createWorld(canvas, { purchaseOrder: orderName, customs: customsSign })
          layout()
          setReady(true)
          request()
        })
        .catch(() => {
          // Without WebGL the chapters still play, over the paper.
        })
    }
    const seen = new IntersectionObserver(
      ([entry]) => {
        near = entry?.isIntersecting ?? false
        if (near && !loading) {
          load()
        }
        if (near) {
          request()
        }
      },
      { rootMargin: "100% 0px" }
    )
    seen.observe(element)
    const resize = new ResizeObserver(() => {
      layout()
      request()
    })
    resize.observe(canvas)
    addEventListener("scroll", request, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      seen.disconnect()
      resize.disconnect()
      removeEventListener("scroll", request)
      world?.dispose()
    }
  }, [orderName, customsSign])

  // Scrolls to where a chapter begins.
  const go = (index: number) => {
    const element = section.current
    const entry = chapters[index]
    if (!element || !entry) {
      return
    }
    const top = element.getBoundingClientRect().top + scrollY
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    scrollTo({
      top: top + (entry.at + 0.02) * (element.offsetHeight - innerHeight),
      behavior: still ? "auto" : "smooth"
    })
  }

  const latest = documents[saved - 1]
  return (
    <section
      id="handoffs"
      ref={section}
      aria-labelledby="journey-title"
      className="relative h-[900svh] motion-reduce:h-[500svh]"
    >
      <h2 id="journey-title" className="sr-only">
        {t("title")}
      </h2>
      <ol className="sr-only">
        {chapters.map((entry) => (
          <li key={entry.key}>
            <h3>{t(`chapters.${entry.key}.title`)}</h3>
            <p>{t(`chapters.${entry.key}.text`)}</p>
          </li>
        ))}
      </ol>
      <div className="sticky top-0 h-svh overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_64%_55%,rgb(255_255_255/0.7),transparent_70%)]"
        />
        <canvas
          ref={surface}
          aria-hidden
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-1000",
            ready ? "opacity-100" : "opacity-0"
          )}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {notes.map((note, i) => (
            <div
              key={`${note.place}-${note.kind}-${note.shown[0]?.[0]}`}
              ref={(element) => {
                pinned.current[i] = element
              }}
              data-shown="false"
              className="group/note absolute top-0 left-0"
            >
              {note.kind === "card" ? (
                <>
                  {/* The card comes after its stem, so when it slides down over its place it hides the stem. */}
                  {!note.spot && (
                    <span className="absolute bottom-0 left-0 h-3 w-px -translate-x-1/2 bg-foreground/25 transition-opacity duration-500 group-data-[shown=false]/note:opacity-0" />
                  )}
                  <div className="absolute bottom-3 left-1/2 origin-bottom -translate-x-1/2 transition-[opacity,scale,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[shown=false]/note:translate-y-2 motion-reduce:group-data-[shown=false]/note:translate-y-0 group-data-[shown=false]/note:scale-95 group-data-[shown=false]/note:opacity-0">
                    {note.content(t, format)}
                  </div>
                </>
              ) : (
                <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#26221f] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg transition-[opacity,translate] duration-500 group-data-[shown=false]/note:translate-y-1 group-data-[shown=false]/note:opacity-0">
                  <span className="size-1.5 rounded-full bg-[#ff8f45]" />
                  {note.content(t, format)}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* The paper comes in behind the words, so the board fades into the page under them. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 start-0 hidden w-[calc(max(1.5rem,(100vw-72rem)/2+1.5rem)+42rem)] bg-[linear-gradient(to_right,var(--paper)_45%,color-mix(in_oklab,var(--paper)_70%,transparent)_65%,transparent)] rtl:bg-[linear-gradient(to_left,var(--paper)_45%,color-mix(in_oklab,var(--paper)_70%,transparent)_65%,transparent)] transition-opacity duration-700 lg:block",
            ending && "opacity-0"
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end bg-[linear-gradient(to_top,var(--paper)_50%,transparent)] px-6 pt-24 pb-8 transition-opacity duration-700 lg:inset-y-0 lg:end-auto lg:start-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] lg:w-[26rem] lg:justify-center lg:bg-none lg:p-0",
            ending && "opacity-0 has-focus-visible:opacity-100"
          )}
        >
          <nav aria-label={t("steps")} className={cn("mb-7 flex flex-wrap gap-1.5", !ending && "pointer-events-auto")}>
            {chapters.map((entry, i) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => go(i)}
                aria-current={i === chapter ? "step" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  i === chapter
                    ? "bg-foreground text-background"
                    : cn(quiet, "hover:bg-foreground/5 hover:text-foreground")
                )}
              >
                {t(`chapters.${entry.key}.step`)}
              </button>
            ))}
          </nav>
          <div aria-hidden className="grid">
            {chapters.map((entry, i) => (
              <div
                key={entry.key}
                className={cn(
                  "col-start-1 row-start-1 transition-[opacity,translate] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:translate-y-0",
                  i === chapter ? "opacity-100" : "pointer-events-none opacity-0",
                  i < chapter && "-translate-y-3",
                  i > chapter && "translate-y-3"
                )}
              >
                <p className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance">
                  {t(`chapters.${entry.key}.title`)}
                </p>
                <p className={cn("mt-4 max-w-sm text-lg text-pretty", quiet)}>{t(`chapters.${entry.key}.text`)}</p>
              </div>
            ))}
          </div>
          {/* The order's documents as they're saved to it. A phone shows the latest. */}
          <div
            aria-hidden
            className="light mt-8 hidden rounded-2xl bg-background/80 p-2 text-sm shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_20px_40px_-24px_rgb(60_30_10/0.3)] backdrop-blur lg:block"
          >
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="font-semibold">{orderName}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{t("documentCount", { count: saved })}</span>
            </div>
            {documents.map((document, i) => (
              <div
                key={document.key}
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  i < saved ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <div
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-700",
                      i === saved - 1 && "bg-primary/[0.07]"
                    )}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="font-medium">{t(`documents.${document.key}`)}</span>
                      <span className="truncate text-xs text-muted-foreground">{document.file}</span>
                    </span>
                    <Check className="size-4 shrink-0 text-success" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p aria-hidden className={cn("mt-4 flex h-5 items-center gap-2 text-sm lg:hidden", quiet)}>
            {latest && (
              <>
                <Check className="size-4 text-success" />
                {t("saved", { name: t(`documents.${latest.key}`) })}
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  )
}
