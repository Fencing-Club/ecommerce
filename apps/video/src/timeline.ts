// The ad's timeline, in seconds: 105 seconds at 60 fps on a 120 BPM grid, so a beat falls every half second and a bar
// every 2. The score, the sound effects and every scene read their timing from here. Sections the score plays grooves
// across start and end on a bar.
export const fps = 60
export const seconds = 105

export const sections = {
  hook: { from: 0, to: 10 },
  reveal: { from: 10, to: 17 },
  forecast: { from: 17, to: 36 },
  reorder: { from: 36, to: 46 },
  amazon: { from: 46, to: 64 },
  handoffs: { from: 64, to: 78 },
  agents: { from: 78, to: 90 },
  recap: { from: 90, to: 94 },
  outcome: { from: 94, to: 98 },
  end: { from: 98, to: 105 }
} as const

export type Section = keyof typeof sections

// The sections in the order they play.
export const order = [
  "hook",
  "reveal",
  "forecast",
  "reorder",
  "amazon",
  "handoffs",
  "agents",
  "recap",
  "outcome",
  "end"
] as const satisfies readonly Section[]

// The section playing at `t` seconds.
export const sectionAt = (t: number): Section =>
  order.find((name) => t >= sections[name].from && t < sections[name].to) ?? "end"

// When each voiceover line starts.
export const cues = [
  { id: "meet", at: 10.8 },
  { id: "onePlace", at: 12.95 },
  { id: "connect", at: 17.7 },
  { id: "forecast", at: 23.3 },
  { id: "stockout", at: 28.4 },
  { id: "order", at: 36.8 },
  { id: "packing", at: 41.8 },
  { id: "amazon", at: 46.8 },
  { id: "split", at: 53.4 },
  { id: "handoffs", at: 64.8 },
  { id: "updates", at: 70 },
  { id: "agents", at: 77.8 },
  { id: "end", at: 98.6 }
] as const

// What happens when inside each section, in seconds from the section's start.
export const moments = {
  hook: {
    // The first pieces of the mess land in the opening half second, so the ad starts already moving.
    open: [0.05, 0.2, 0.35],
    lines: [0.1, 2, 3, 4.5, 6],
    emails: [3, 3.18, 3.36, 3.54, 3.72, 3.9, 4.08, 4.26],
    sheets: [4.5, 4.75, 5, 5.25],
    stockout: 6,
    stamps: [7, 7.5, 8, 8.5],
    errors: [7.25, 7.75, 8.25, 8.75, 9, 9.25],
    freeze: 9.5
  },
  reveal: { snap: 0, assemble: 0.45, logo: 1, tiles: 1, rows: 2, out: 6.6 },
  forecast: {
    window: 0.3,
    connectShopify: 1.6,
    connectAmazon: 2.6,
    synced: 3.4,
    restock: 4.6,
    rows: [5, 5.15, 5.3, 5.45],
    zoom: 7.2,
    maths: [7.8, 8.2, 8.6, 9, 9.4],
    answer: 9.9,
    // The holiday forecast: the chart arrives, stock runs out and falls into lost sales, which count up, then the order
    // date, the order's flight through its lead time, and its landing ahead of the busy season.
    season: 11.1,
    runsOut: 12.6,
    lost: 13.4,
    orderBy: 14.6,
    arrives: 15.6,
    out: 18.6
  },
  reorder: {
    window: 0.3,
    reorder: 1.4,
    lines: [2, 2.2, 2.4],
    submit: 3.6,
    supplier: 5,
    cartons: [5.9, 6.2, 6.5, 6.8],
    packed: 8,
    out: 9.6
  },
  amazon: {
    window: 0.3,
    steps: [1.4, 2, 2.6, 3.2, 3.8, 4.4],
    labels: [5.2, 5.35, 5.5, 5.65, 5.8, 5.95],
    // The split lands on the voice's words: FBA, AWD, then the two slide aside at "including" to make room, and AWD
    // offshore lands on "China", with the fees at "where storage costs even less".
    split: 7.4,
    fba: 9.2,
    awd: 10.1,
    reflow: 11.3,
    offshore: 13.55,
    fees: 15.1,
    out: 17.6
  },
  handoffs: {
    windows: [0.4, 0.6, 0.8],
    links: 1.4,
    supplier: 4.6,
    download: 6.5,
    checklist: [7.3, 7.6, 7.9, 8.2],
    forwarder: 8.7,
    shipped: 9.3,
    buyer: 10.1,
    documents: [10.5, 10.7, 10.9, 11.1, 11.3, 11.5],
    out: 13.6
  },
  agents: {
    panels: 0.3,
    typing: [0.8, 2.4],
    send: 2.5,
    steps: [3.4, 4.8, 6.2, 7.6],
    partners: [8.8, 9.6],
    out: 11.6
  },
  recap: { cuts: [0, 1, 2, 3] },
  outcome: { headline: 0.15, chart: 0.3, stocked: 1.2, out: 3.65 },
  // The final hit lands after the voiceover's last word, as the call to action settles.
  end: { logo: 0, tagline: 1.2, cta: 2.4, final: 4, fade: 6.4 }
} as const

// A moment's time from the start of the ad.
// The cutdowns, by length in seconds: each is stitched from stretches of the full ad, cut on the beat so the score
// carries across the joins. A line is heard only if it fits whole inside a stretch.
export const cutdowns = {
  30: [
    [0, 17],
    [23, 28],
    [96, 104]
  ],
  15: [
    [4, 14],
    [98, 103]
  ],
  6: [
    [9.8, 12],
    [98, 101.8]
  ]
} as const satisfies Record<number, readonly Stretch[]>

// A stretch of the full ad, from and to, in seconds.
type Stretch = readonly [number, number]

// Where each stretch lands in its cutdown.
export const placed = (stretches: readonly Stretch[]) =>
  stretches.map(([from, to], i) => ({
    from,
    to,
    start: stretches.slice(0, i).reduce((sum, [a, b]) => sum + b - a, 0)
  }))

export const lengthOf = (stretches: readonly Stretch[]) => stretches.reduce((sum, [from, to]) => sum + to - from, 0)

// Whether a line heard from `at` to `end` fits whole inside one of a cutdown's stretches.
export const fits = (stretches: readonly Stretch[], at: number, end: number) =>
  stretches.some(([from, to]) => at >= from - 0.001 && end <= to + 0.001)

export const at = (section: Section, offset: number) => sections[section].from + offset
