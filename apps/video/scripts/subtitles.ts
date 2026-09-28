// Writes subtitles for the ad and each cutdown to out/ as SRT files: every voiceover line a cut keeps, split into cues
// of at most two lines of 42 characters, each timed to its words in the take.
import { mkdir, writeFile } from "node:fs/promises"
import { cues, cutdowns, fits, placed } from "../src/timeline.ts"
import { voiceover } from "../src/voiceover.ts"
import { readTakes } from "./takes.ts"

const takes = await readTakes()
const width = 42

type Word = { text: string; start: number; end: number }
type Cue = { start: number; end: number; text: string }

const joined = (words: readonly Word[]) => words.map(({ text }) => text).join(" ")

// Splits words in two where both halves fit `limit` characters: after a comma if one allows it, and as evenly as
// possible.
const halve = (words: readonly Word[], limit: number) => {
  const options = words.slice(1).map((_, i) => {
    const first = words.slice(0, i + 1)
    const second = words.slice(i + 1)
    return {
      first,
      second,
      longer: Math.max(joined(first).length, joined(second).length),
      clause: /[,;:]$/.test(first.at(-1)?.text ?? "")
    }
  })
  let pool = options.filter(({ longer }) => longer <= limit)
  if (pool.some(({ clause }) => clause)) {
    pool = pool.filter(({ clause }) => clause)
  }
  if (pool.length === 0) {
    pool = options
  }
  return pool.reduce((best, option) => (option.longer < best.longer ? option : best))
}

// Groups a sentence's words into cues of at most two lines.
const grouped = (words: readonly Word[]): Word[][] => {
  if (words.length < 2 || joined(words).length <= width * 2) {
    return [[...words]]
  }
  const { first, second } = halve(words, width * 2)
  return [...grouped(first), ...grouped(second)]
}

const wrapped = (words: readonly Word[]) => {
  if (joined(words).length <= width) {
    return joined(words)
  }
  const { first, second } = halve(words, width)
  return `${joined(first)}\n${joined(second)}`
}

// A line's cues, starting `at` seconds in: each sentence of its caption, split where it runs past two lines, each cue
// shown from its first word to its last.
const cuesFor = (id: keyof typeof voiceover, at: number): Cue[] => {
  const timings = takes.lines[id]?.words ?? []
  const words = voiceover[id].caption
    .split(" ")
    .map((text, i) => ({ text, start: at + (timings[i]?.start ?? 0), end: at + (timings[i]?.end ?? 0) }))
  const sentences: Word[][] = []
  for (const word of words) {
    const sentence = sentences.at(-1)
    if (!sentence || /[.?!]$/.test(sentence.at(-1)?.text ?? "")) {
      sentences.push([word])
    } else {
      sentence.push(word)
    }
  }
  return sentences.flatMap(grouped).map((group) => ({
    start: group[0]?.start ?? at,
    end: group.at(-1)?.end ?? at,
    text: wrapped(group)
  }))
}

const stamp = (seconds: number) => {
  const ms = Math.round(seconds * 1000)
  const part = (value: number, digits = 2) => String(value).padStart(digits, "0")
  return `${part(Math.floor(ms / 3_600_000))}:${part(Math.floor(ms / 60_000) % 60)}:${part(Math.floor(ms / 1000) % 60)},${part(ms % 1000, 3)}`
}

// Each cue stays up a moment after its last word, at least a second in all, but never into the next cue.
const srt = (all: readonly Cue[]) =>
  all
    .map(({ start, end, text }, i) => {
      const next = all[i + 1]?.start ?? Infinity
      const shown = Math.min(Math.max(end + 0.3, start + 1), next - 0.05)
      return `${i + 1}\n${stamp(start)} --> ${stamp(shown)}\n${text}\n`
    })
    .join("\n")

await mkdir("out", { recursive: true })
await writeFile("out/copacker.srt", srt(cues.flatMap(({ id, at }) => cuesFor(id, at))))
for (const [length, stretches] of Object.entries(cutdowns)) {
  const parts = placed(stretches)
  const kept = cues.flatMap(({ id, at }) => {
    const home = parts.find(({ from, to }) => at >= from - 0.001 && at < to)
    const end = at + (takes.lines[id]?.end ?? 0)
    return home && fits(stretches, at, end) ? cuesFor(id, home.start + at - home.from) : []
  })
  await writeFile(`out/copacker-${length}.srt`, srt(kept))
}
process.stdout.write("out/copacker.srt, and one for each cutdown\n")
