// Writes captions for the finished video next to it, So Long and Thanks for All the Tokens.vtt: every line sung or
// spoken, shown from its first word to its last and wrapped to at most two lines of 42 characters. The sung lines are
// marked as music; the spoken ones at the end aren't.
import { writeFile } from "node:fs/promises"
import { lyrics } from "../src/timeline.ts"
import { words } from "../src/words.ts"

const width = 42
const spoken = new Set(["tuesday", "access"])

type Cue = { start: number; end: number; text: string }

// A line split in two where both halves fit: at a comma or before a dash if that leaves the halves near enough even,
// otherwise as evenly as possible.
const wrapped = (text: string, limit: number) => {
  if (text.length <= limit) {
    return text
  }
  const parts = text.split(" ")
  const options = parts.slice(1).map((_, i) => {
    const first = parts.slice(0, i + 1).join(" ")
    const second = parts.slice(i + 1).join(" ")
    const longer = Math.max(first.length, second.length)
    const clause = /[,;:]$/.test(first) || second.startsWith("\u2014")
    return { first, second, longer, phrased: clause && Math.min(first.length, second.length) >= 0.4 * longer }
  })
  let pool = options.filter(({ longer }) => longer <= limit)
  if (pool.some(({ phrased }) => phrased)) {
    pool = pool.filter(({ phrased }) => phrased)
  }
  if (pool.length === 0) {
    pool = options
  }
  const { first, second } = pool.reduce((best, option) => (option.longer < best.longer ? option : best))
  return `${first}\n${second}`
}

const lines = Object.entries(lyrics).toSorted(([, a], [, b]) => a.at - b.at)
const cues: Cue[] = lines.flatMap(([id, { at, text }], i) => {
  const next = lines[i + 1]?.[1].at ?? Infinity
  const sung = words.filter(([start]) => start >= at - 0.01 && start < next - 0.01)
  const first = sung[0]
  const last = sung.at(-1)
  if (!text || !first || !last) {
    return []
  }
  if (spoken.has(id)) {
    return [{ start: first[0], end: last[1], text: wrapped(text, width) }]
  }
  return [{ start: first[0], end: last[1], text: `\u266a ${wrapped(text, width - 2)} \u266a` }]
})

const stamp = (seconds: number) => {
  const ms = Math.round(seconds * 1000)
  const part = (value: number, digits = 2) => String(value).padStart(digits, "0")
  return `${part(Math.floor(ms / 3_600_000))}:${part(Math.floor(ms / 60_000) % 60)}:${part(Math.floor(ms / 1000) % 60)}.${part(ms % 1000, 3)}`
}

// Each cue stays up a moment after its last word, at least a second in all, but never into the next cue.
const vtt = [
  "WEBVTT",
  ...cues.map(({ start, end, text }, i) => {
    const next = cues[i + 1]?.start ?? Infinity
    const shown = Math.min(Math.max(end + 0.3, start + 1), next - 0.05)
    return `${stamp(start)} --> ${stamp(shown)}\n${text}`
  })
].join("\n\n")

const name = "So Long and Thanks for All the Tokens.vtt"
await writeFile(new URL(`../${name}`, import.meta.url), `${vtt}\n`)
process.stdout.write(`${name}: ${cues.length} cues\n`)
