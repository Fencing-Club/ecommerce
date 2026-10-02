// The show's clock, in seconds, measured from the mix of the song: when each lyric line starts comes from a transcript
// with word timings, and the beat from the song's onsets. A new mix means measuring these again; every scene reads its
// timing from here.
export const fps = 30
export const songLength = 253.12
// How long each credits card holds after the music, in seconds.
export const creditHolds = [3.5, 4.5, 4.5, 3, 3.5] as const
export const creditsLength = creditHolds.reduce((total, hold) => total + hold, 0)
export const length = songLength + creditsLength

export const lyrics = {
  ahh: { at: 0.18, text: "Ahhhhhh…" },
  curtain: { at: 13, text: "" },
  tenYears: { at: 14.36, text: "Ten years of Teams calls, bugs and builds," },
  dashboards: { at: 17.94, text: "Of dashboards, flights and endless thrills," },
  pullRequests: { at: 21.2, text: "Of pull requests at half past five," },
  pipelines: { at: 24.46, text: "And pipelines somehow still alive." },
  iCame: { at: 27.8, text: "I came, I coded, shipped some stuff," },
  refactor: { at: 30.88, text: "Said, “One more refactor” — that’s enough." },
  crystal: { at: 34.16, text: "Got the crystal, got the cube," },
  loggingOff: { at: 37.22, text: "And now I’m logging off for good." },
  commit: { at: 40.72, text: "One final commit," },
  deploy: { at: 42.32, text: "One final deploy," },
  meeting: { at: 44.38, text: "One final meeting we all could avoid…" },
  soLong1: { at: 50.06, text: "So long, and thanks for all the tokens," },
  prompt: { at: 53.62, text: "For every prompt and build we’ve broken," },
  bug: { at: 56.86, text: "For every bug that disappeared" },
  cameNear: { at: 59.78, text: "As soon as someone else came near." },
  soLong2: { at: 63.28, text: "So long, and thanks for all the tokens," },
  acronyms: { at: 66.8, text: "For acronyms best left unspoken," },
  tenYearsWent: { at: 69.68, text: "Ten years went by — somehow that’s true," },
  badge: { at: 72.96, text: "And now my badge is leaving too!" },
  interval: { at: 76.02, text: "(Interval)" },
  cloud: { at: 83.22, text: "We moved to cloud," },
  movedAgain: { at: 84.7, text: "then moved again," },
  frameworks: { at: 86.54, text: "Migrated frameworks now and then," },
  flags: { at: 89.84, text: "We added flags to hide the flags that turned on other feature flags." },
  kusto: { at: 96.38, text: "We queried Kusto late at night," },
  telemetry: { at: 99.62, text: "Declared the telemetry “looks alright,”" },
  shipped: { at: 102.96, text: "The build went green, we shipped the code…" },
  incident: { at: 105.8, text: "…then watched another incident unfold." },
  soLong3: { at: 109.34, text: "So long, and thanks for all the tokens," },
  windows: { at: 112.84, text: "For all the context windows broken," },
  cause: { at: 116.1, text: "Copilot said, “I found the cause!”" },
  seventeen: { at: 118.94, text: "Then changed seventeen files just because…" },
  soLong4: { at: 122.48, text: "So long, and thanks for all the tokens," },
  agents: { at: 126, text: "For every agent we’ve awoken," },
  planned: { at: 129.3, text: "They planned, they reasoned, they reviewed…" },
  compiled: { at: 132.38, text: "And occasionally compiled too!" },
  meetingDue: { at: 135.66, text: "There’s always one more meeting due," },
  preview: { at: 139.4, text: "One more preview to push through," },
  thread: { at: 142.8, text: "One more thread with forty replies," },
  howOrWhy: { at: 145.74, text: "And still no one knows the how or why." },
  quickQuestion: { at: 150.4, text: "“Quick question” never once was quick," },
  smallChange: { at: 153.78, text: "“Small change” was rarely quite that slick," },
  ado: { at: 157.44, text: "And somewhere deep in A-D-O," },
  task: { at: 162.1, text: "A task left from eight years ago…" },
  sincere: { at: 165.7, text: "(And now for something completely sincere)" },
  underneath: { at: 168.52, text: "But underneath the builds and on-calls," },
  standups: { at: 172.46, text: "The stand-ups, specs, and Teams app stalls," },
  people: { at: 176.48, text: "Were people I was lucky to know," },
  letGo: { at: 179.98, text: "And that’s the part that’s hard to let go." },
  learned: { at: 184.58, text: "I learned a lot, I built a lot," },
  cached: { at: 186.56, text: "I probably cached more than I ought," },
  tenGoodYears: { at: 188.52, text: "And after ten good years, it seems" },
  closeTeams: { at: 192.24, text: "It’s time to close a few more Teams." },
  blackout: { at: 198.75, text: "" },
  soLong5: { at: 199.48, text: "So long, and thanks for all the tokens," },
  feature: { at: 203.1, text: "For every feature built and broken," },
  fixed: { at: 206.36, text: "Then fixed, then shipped, then flighted wide," },
  hotfix: { at: 209.7, text: "With one last hotfix on the side." },
  soLong6: { at: 212.8, text: "So long, and thanks for all the tokens," },
  friendship: { at: 216.28, text: "For every friendship, laugh and moment," },
  finalPr: { at: 219.52, text: "The final pull request is through…" },
  chord: { at: 221.9, text: "" },
  tuesday: { at: 226, text: "And if anything breaks after Tuesday…" },
  access: { at: 230.74, text: "I no longer have access." },
  soLooong: { at: 233.92, text: "SO LOOOOONG!" },
  lastSo: { at: 250.48, text: "So…" },
  lastLong: { at: 252.44, text: "…long!" },
  credits: { at: songLength, text: "" }
} as const

export type Line = keyof typeof lyrics

// When a line starts.
export const at = (line: Line) => lyrics[line].at

// The parts of the show in order, each from its first moment to the next one's.
export const parts = [
  { id: "overture", from: 0 },
  { id: "act1", from: at("curtain") },
  { id: "interval", from: at("interval") },
  { id: "act2", from: at("cloud") },
  { id: "act3", from: at("soLong3") },
  { id: "act4", from: at("meetingDue") },
  { id: "sincere", from: at("sincere") },
  { id: "act5", from: at("underneath") },
  { id: "finale", from: at("soLong5") },
  { id: "epilogue", from: 225.9 },
  { id: "curtainCall", from: at("soLooong") },
  { id: "credits", from: at("credits") }
] as const

export type Part = (typeof parts)[number]["id"]

export const partAt = (t: number) => parts.findLast(({ from }) => t >= from) ?? parts[0]

// The quick changes, where the stage is reset between one bit and the next under a blink of the lights.
export const changes = [
  ...(
    [
      "soLong1",
      "prompt",
      "bug",
      "soLong2",
      "acronyms",
      "tenYearsWent",
      "badge",
      "kusto",
      "telemetry",
      "shipped",
      "soLong3",
      "windows",
      "cause",
      "seventeen",
      "agents",
      "planned",
      "meetingDue",
      "preview",
      "thread",
      "quickQuestion",
      "sincere",
      "underneath",
      "standups",
      "feature",
      "hotfix",
      "soLong6",
      "friendship",
      "finalPr"
    ] as const
  ).map(at),
  // The kick line comes back after the graffiti.
  at("soLong4") + 0.9
]

// The beat, fitted to the song's onsets and the sung downbeats: 145.94 beats a minute, the first at 0.345 s. The pause
// before the final chorus comes back 0.3 of a beat early, so the grid shifts there.
const beatLength = 60 / 145.94
const firstBeat = (t: number) => (t < 198.9 ? 0.345 : 0.222)

// Beats since the first, fractional; whole numbers land on the beat.
export const beats = (t: number) => (t - firstBeat(t)) / beatLength

// The token meter tops out at eight nines just as the final pull request goes through, strains, then bursts.
export const meter = { top: 99_999_999, full: 221.3, burst: 221.6 }
const growth = 20

// Every token the show has spent by `t`: compounding all evening, faster and faster, until the meter can count no more.
export const tokensAt = (t: number) =>
  Math.min(meter.top, (meter.top * (Math.exp(t / growth) - 1)) / (Math.exp(meter.full / growth) - 1))

// How many tokens a second the show is spending at `t`.
export const tokenRate = (t: number) =>
  t >= meter.full ? 0 : (meter.top * Math.exp(t / growth)) / growth / (Math.exp(meter.full / growth) - 1)
