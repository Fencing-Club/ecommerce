"use client"

import { Check, FileText, Ship } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { StatusBadge } from "@/components/common"
import { cn } from "@/lib/utils"
import type { Place, World } from "./journey-world"
import { through } from "./scroll"

// One purchase order's trip from the supplier's factory to Amazon and the seller's own warehouse, played by scroll over
// a 3D diorama (./journey-world). The section is tall and its view is pinned, so scrolling moves the trip along, with
// the chapter's words on the left, the order's documents filling in beneath them as each is made, and the app's own
// cards pinned to the places they belong to. The world loads only as the section comes near. With reduced motion, the
// trip steps from chapter to chapter instead of moving. The points on the trip follow the world's beats.

type Chapter = { at: number; step: string; title: string; text: string }

const chapters: Chapter[] = [
  {
    at: 0,
    step: "Order",
    title: "Reorder in one click.",
    text: "Copacker writes the purchase order and sends it to your supplier."
  },
  {
    at: 0.1,
    step: "Pack",
    title: "Labeled, and packed to fit.",
    text: "FNSKU and choking hazard labels go on each unit, carton and shipping labels on each box, and every box is sized to fit."
  },
  {
    at: 0.34,
    step: "Pick up",
    title: "Amazon and your forwarder pick up.",
    text: "Amazon takes the cartons bound for AWD overseas, and your forwarder takes the rest."
  },
  {
    at: 0.48,
    step: "Ship",
    title: "On its way.",
    text: "The pickup, the commercial invoice and the tracking all land on the same order."
  },
  {
    at: 0.74,
    step: "Deliver",
    title: "Delivered to FBA, and to you.",
    text: "Your forwarder drops Amazon’s cartons at FBA and brings the rest to your own warehouse."
  }
]

// Where each chapter's still frame sits, for reduced motion.
const stills = [0.09, 0.3, 0.47, 0.73, 1]

// The order's documents, each saved to it at the point on the trip where it's made.
const documents = [
  { at: 0.06, name: "Purchase order", file: "PO-1043.pdf" },
  { at: 0.138, name: "FNSKU labels", file: "PO-1043-fnsku-labels.pdf" },
  { at: 0.146, name: "Choking hazard labels", file: "PO-1043-choking-hazard.pdf" },
  { at: 0.212, name: "Packing list", file: "PO-1043-packing-list.pdf" },
  { at: 0.232, name: "Carton labels", file: "PO-1043-carton-labels.pdf" },
  { at: 0.237, name: "Shipping labels", file: "PO-1043-shipping-labels.pdf" },
  { at: 0.5, name: "Commercial invoice", file: "PO-1043-invoice.pdf" }
]

// A card or a pin, pinned to a place in the world, or held at `spot` on the screen when the place moves too much for a
// card to follow it.
type Note = {
  place: Place
  shown: [number, number][]
  kind: "card" | "pin"
  spot?: { x: number; y: number }
  content: React.ReactNode
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

const notes: Note[] = [
  {
    place: "order",
    kind: "card",
    shown: [[0.015, 0.1]],
    content: (
      <Card>
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="font-semibold">Purchase order 1043</span>
          <span className="ml-auto">
            <StatusBadge tone="info">With supplier</StatusBadge>
          </span>
        </div>
        <Rows
          rows={[
            ["Supplier", "Shenzhen Metalworks"],
            ["Units", "3,180"],
            ["Total", "$13,650.00"]
          ]}
        />
      </Card>
    )
  },
  { place: "stickers", kind: "pin", shown: [[0.12, 0.19]], content: "FNSKU and choking hazard labels" },
  { place: "fit", kind: "pin", shown: [[0.19, 0.225]], content: "Right-sized to 40 × 28 × 29 cm" },
  { place: "labels", kind: "pin", shown: [[0.232, 0.265]], content: "Carton and shipping labels" },
  {
    place: "packing",
    kind: "card",
    shown: [[0.27, 0.34]],
    content: (
      <Card>
        <div className="flex items-center gap-2">
          <span className="font-semibold">Packing list</span>
          <span className="ml-auto">
            <StatusBadge tone="success">Submitted</StatusBadge>
          </span>
        </div>
        <Rows
          rows={[
            ["Cartons", "160"],
            ["Carton size", "40 × 28 × 29 cm"],
            ["Weight", "1,610 kg"]
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
    content: (
      <Card className="w-72">
        <span className="font-semibold">Shipments</span>
        <Rows
          rows={[
            ["AWD in China, by Amazon", "1,440 units"],
            ["Amazon FBA", "1,260 units"],
            ["Your warehouse", "480 units"]
          ]}
        />
      </Card>
    )
  },
  {
    place: "quay",
    kind: "card",
    shown: [[0.49, 0.58]],
    content: (
      <Card className="w-72">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Ship className="size-4" />
          </span>
          <span className="flex flex-col leading-snug">
            <span className="font-medium">Picked up by Pacific Link Logistics</span>
            <span className="text-muted-foreground">Oct 6, 4:12 PM</span>
          </span>
        </div>
      </Card>
    )
  },
  {
    place: "ship",
    kind: "card",
    shown: [[0.6, 0.74]],
    content: (
      <Card className="w-56">
        <div className="flex items-center gap-2">
          <span className="font-semibold">On the water</span>
          <span className="ml-auto">
            <StatusBadge tone="info">In transit</StatusBadge>
          </span>
        </div>
        <Rows rows={[["Arrives", "Nov 24"]]} />
      </Card>
    )
  },
  {
    place: "fba",
    kind: "card",
    shown: [[0.875, 0.93]],
    content: (
      <Card className="w-60">
        <span className="font-semibold">Checked in at Amazon FBA</span>
        <Rows rows={[["Units", "1,260"]]} />
      </Card>
    )
  },
  {
    place: "yours",
    kind: "card",
    shown: [[0.935, 0.975]],
    content: (
      <Card className="w-60">
        <span className="font-semibold">Delivered to your warehouse</span>
        <Rows rows={[["Units", "480"]]} />
      </Card>
    )
  },
  {
    place: "factory",
    kind: "pin",
    shown: [
      [0, 0.1],
      [0.3, 0.5],
      [0.96, 1]
    ],
    content: "Shenzhen Metalworks"
  },
  {
    place: "china",
    kind: "pin",
    shown: [
      [0.465, 0.52],
      [0.96, 1]
    ],
    content: "AWD in China"
  },
  {
    place: "fba",
    kind: "pin",
    shown: [
      [0.76, 0.875],
      [0.96, 1]
    ],
    content: "Amazon FBA"
  },
  {
    place: "yours",
    kind: "pin",
    shown: [
      [0.76, 0.935],
      [0.975, 1]
    ],
    content: "Your warehouse"
  }
]

export function Journey() {
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

    const layout = () => {
      const wide = innerWidth >= 1024
      world?.resize(canvas.clientWidth, canvas.clientHeight, wide ? { x: 0.66, y: 0.6 } : { x: 0.5, y: 0.34 })
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
      const played = wide ? shown : Math.min(shown, 0.958)
      if (world) {
        world.frame(played, still ? 0 : (now - start) / 1000)
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
          world = createWorld(canvas)
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
  }, [])

  // Scrolls to where a chapter begins.
  const go = (index: number) => {
    const element = section.current
    const entry = chapters[index]
    if (!element || !entry) {
      return
    }
    const top = element.getBoundingClientRect().top + scrollY
    scrollTo({ top: top + (entry.at + 0.02) * (element.offsetHeight - innerHeight), behavior: "smooth" })
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
        One purchase order, from the factory to Amazon and your warehouse
      </h2>
      <ol className="sr-only">
        {chapters.map((entry) => (
          <li key={entry.step}>
            <h3>{entry.title}</h3>
            <p>{entry.text}</p>
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
                <div className="absolute bottom-3 left-1/2 origin-bottom -translate-x-1/2 transition-[opacity,scale,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[shown=false]/note:translate-y-2 group-data-[shown=false]/note:scale-95 group-data-[shown=false]/note:opacity-0">
                  {note.content}
                  {!note.spot && (
                    <span className="absolute top-full left-1/2 h-3 w-px -translate-x-1/2 bg-foreground/25" />
                  )}
                </div>
              ) : (
                <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#26221f] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg transition-[opacity,translate] duration-500 group-data-[shown=false]/note:translate-y-1 group-data-[shown=false]/note:opacity-0">
                  <span className="size-1.5 rounded-full bg-[#ff8f45]" />
                  {note.content}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* The paper comes in behind the words, so the board fades into the page under them. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 hidden w-[calc(max(1.5rem,(100vw-72rem)/2+1.5rem)+42rem)] bg-[linear-gradient(to_right,var(--paper)_45%,color-mix(in_oklab,var(--paper)_70%,transparent)_65%,transparent)] transition-opacity duration-700 lg:block",
            ending && "opacity-0"
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end bg-[linear-gradient(to_top,var(--paper)_50%,transparent)] px-6 pt-24 pb-8 transition-opacity duration-700 lg:inset-y-0 lg:right-auto lg:left-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] lg:w-[26rem] lg:justify-center lg:bg-none lg:p-0",
            ending && "opacity-0"
          )}
        >
          <nav aria-label="Steps" className={cn("mb-7 flex flex-wrap gap-1.5", !ending && "pointer-events-auto")}>
            {chapters.map((entry, i) => (
              <button
                key={entry.step}
                type="button"
                onClick={() => go(i)}
                aria-current={i === chapter ? "step" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  i === chapter
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                {entry.step}
              </button>
            ))}
          </nav>
          <div aria-hidden className="grid">
            {chapters.map((entry, i) => (
              <div
                key={entry.step}
                className={cn(
                  "col-start-1 row-start-1 transition-[opacity,translate] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  i === chapter ? "opacity-100" : "pointer-events-none opacity-0",
                  i < chapter && "-translate-y-3",
                  i > chapter && "translate-y-3"
                )}
              >
                <p className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance">
                  {entry.title}
                </p>
                <p className="mt-4 max-w-sm text-lg text-pretty text-muted-foreground">{entry.text}</p>
              </div>
            ))}
          </div>
          {/* The order's documents as they're saved to it. A phone shows the latest. */}
          <div
            aria-hidden
            className="light mt-8 hidden rounded-2xl bg-background/80 p-2 text-sm shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_20px_40px_-24px_rgb(60_30_10/0.3)] backdrop-blur lg:block"
          >
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="font-semibold">Purchase order 1043</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {saved} {saved === 1 ? "document" : "documents"}
              </span>
            </div>
            {documents.map((document, i) => (
              <div
                key={document.name}
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
                      <span className="font-medium">{document.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{document.file}</span>
                    </span>
                    <Check className="size-4 shrink-0 text-success" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p aria-hidden className="mt-4 flex h-5 items-center gap-2 text-sm text-muted-foreground lg:hidden">
            {latest && (
              <>
                <Check className="size-4 text-success" />
                Saved to the purchase order: {latest.name}
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  )
}
