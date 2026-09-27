// The ad's timeline, in seconds: 90 seconds at 60 fps on a 120 BPM grid, so a beat falls every half second and a bar
// every 2. The score, the sound effects and every scene read their timing from here.
export const fps = 60
export const seconds = 90

export const sections = {
  hook: { from: 0, to: 10 },
  reveal: { from: 10, to: 17 },
  forecast: { from: 17, to: 30 },
  reorder: { from: 30, to: 40 },
  amazon: { from: 40, to: 56 },
  handoffs: { from: 56, to: 70 },
  agents: { from: 70, to: 80 },
  recap: { from: 80, to: 84 },
  end: { from: 84, to: 90 }
} as const

export type Section = keyof typeof sections

// When each voiceover line starts.
export const cues = [
  { id: "meet", at: 10.8 },
  { id: "onePlace", at: 12.95 },
  { id: "connect", at: 17.7 },
  { id: "forecast", at: 23.3 },
  { id: "order", at: 30.8 },
  { id: "packing", at: 35.8 },
  { id: "amazon", at: 40.8 },
  { id: "split", at: 47.4 },
  { id: "handoffs", at: 56.8 },
  { id: "updates", at: 62 },
  { id: "agents", at: 69.95 },
  { id: "end", at: 84.6 }
] as const

// What happens when inside each section, in seconds from the section's start.
export const moments = {
  hook: {
    lines: [0, 2, 3, 4.5, 6],
    emails: [3, 3.18, 3.36, 3.54, 3.72, 3.9, 4.08, 4.26],
    sheets: [4.5, 4.75, 5, 5.25],
    stockout: 6,
    stamps: [7, 7.5, 8, 8.5],
    errors: [7.25, 7.75, 8.25, 8.75, 9, 9.25],
    freeze: 9.5
  },
  reveal: { snap: 0, assemble: 0.45, logo: 1, tiles: 2.5, rows: 3.5, out: 6.6 },
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
    out: 12.6
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
    split: 7.4,
    fba: 7.9,
    awd: 8.3,
    fees: 9.5,
    out: 15.6
  },
  handoffs: {
    windows: [0.4, 0.6, 0.8],
    links: 1.4,
    supplier: 4.5,
    checklist: [5.4, 5.8, 6.2, 6.6],
    download: 7.3,
    forwarder: 8.6,
    shipped: 9.2,
    documents: [10.2, 10.4, 10.6, 10.8, 11, 11.2],
    out: 13.6
  },
  agents: {
    panels: 0.3,
    typing: [0.8, 2.4],
    send: 2.5,
    steps: [3.2, 4.2, 5.2, 6.2],
    partners: [7.2, 7.9],
    out: 9.6
  },
  recap: { cuts: [0, 1, 2, 3] },
  end: { logo: 0, tagline: 1.2, fade: 5.4 }
} as const

// A moment's time from the start of the ad.
export const at = (section: Section, offset: number) => sections[section].from + offset
