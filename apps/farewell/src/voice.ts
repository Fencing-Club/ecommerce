import { words } from "./words"

export type Voice = { open: number; round: boolean }

// A word's syllables, one vowel sound each; a silent final e isn't one.
const syllables = (word: string) => {
  const lower = word.toLowerCase()
  const groups = lower.match(/[aeiouy]+/g) ?? ["a"]
  return groups.length > 1 && /[^aeiouy]e$/.test(lower) ? groups.slice(0, -1) : groups
}

const sung = words.map(([from, to, word]) => ({ from, to, vowels: syllables(word) }))

// The last word to start by `t`.
const wordAt = (t: number) => {
  let lo = 0
  let hi = sung.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if ((sung[mid]?.from ?? Number.POSITIVE_INFINITY) <= t) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return sung[found]
}

// How open a singer's mouth is at `t`, from shut (0) to wide (1), and whether the vowel rounds it. Each syllable opens
// fast, a frame ahead of the sound, holds, and closes just before the next; a note held longer than a second breathes.
export const voiceAt = (heard: number): Voice => {
  const t = heard + 0.04
  const word = wordAt(t)
  if (!word || t > word.to) {
    return { open: 0, round: false }
  }
  const length = (word.to - word.from) / word.vowels.length
  const k = Math.min(word.vowels.length - 1, Math.floor((t - word.from) / length))
  const into = t - word.from - k * length
  const shape = Math.max(0, Math.min(1, into / 0.06, (length - into) / 0.09))
  const breath = length > 1 ? 0.85 + 0.15 * Math.sin(into * 5) : 1
  const vowel = word.vowels[k] ?? "a"
  return { open: shape * breath, round: vowel.startsWith("o") || vowel === "ue" }
}
