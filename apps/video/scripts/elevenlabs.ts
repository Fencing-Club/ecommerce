// The ad's voice, from ElevenLabs. `voices` lists the voices the key can use; `audition <voice id>...` reads the whole
// voiceover in each voice into out/auditions/, for choosing one; `record <voice id>` records the ad's takes, line by
// line (or only the lines named), recording again any take that skips a word; `check` transcribes the takes and lists
// any words they skipped. The key comes from ELEVENLABS_API_KEY in .env.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { voiceover } from "../src/voiceover.ts"
import { readTakes } from "./takes.ts"

const key = process.env.ELEVENLABS_API_KEY
if (!key) {
  throw new Error("Set ELEVENLABS_API_KEY in apps/video/.env")
}

const request = async (path: string, body?: object) => {
  const form = body instanceof FormData
  const response = await fetch(`https://api.elevenlabs.io${path}`, {
    method: body ? "POST" : "GET",
    headers: form ? { "xi-api-key": key } : { "xi-api-key": key, "content-type": "application/json" },
    body: form ? body : body && JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error(`ElevenLabs answered ${response.status} to ${path}: ${await response.text()}`)
  }
  return response
}

const Voice = z.object({
  voice_id: z.string(),
  name: z.string(),
  labels: z.record(z.string(), z.string()).optional()
})

const listVoices = async () => {
  const { voices } = z
    .object({ voices: z.array(Voice) })
    .parse(await (await request("/v2/voices?page_size=100")).json())
  for (const voice of voices) {
    process.stdout.write(`${voice.voice_id}  ${voice.name}  (${Object.values(voice.labels ?? {}).join(", ")})\n`)
  }
}

const audition = async (voiceIds: readonly string[]) => {
  const script = Object.values(voiceover)
    .map((line) => line.spoken)
    .join("\n\n")
  await mkdir("out/auditions", { recursive: true })
  for (const voiceId of voiceIds) {
    const voice = Voice.parse(await (await request(`/v1/voices/${voiceId}`)).json())
    const audio = await request(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      text: script,
      model_id: "eleven_v3"
    })
    const file = `out/auditions/${voice.name.split(" ")[0].toLowerCase()}.mp3`
    await writeFile(file, Buffer.from(await audio.arrayBuffer()))
    process.stdout.write(`${file}\n`)
  }
}

const Take = z.object({
  audio_base64: z.string(),
  alignment: z.object({
    characters: z.array(z.string()),
    character_start_times_seconds: z.array(z.number()),
    character_end_times_seconds: z.array(z.number())
  })
})

type Word = { text: string; start: number; end: number }

const seconds = (value: number) => Math.round(value * 1000) / 1000

// Groups a take's character timings into words, for placing the line on its beat and timing its caption.
const wordsOf = ({
  characters,
  character_start_times_seconds,
  character_end_times_seconds
}: z.infer<typeof Take>["alignment"]) => {
  const words: Word[] = []
  let word: Word | undefined
  characters.forEach((character, i) => {
    if (/\s/.test(character)) {
      word = undefined
    } else if (word) {
      word.text += character
      word.end = seconds(character_end_times_seconds[i])
    } else {
      word = {
        text: character,
        start: seconds(character_start_times_seconds[i]),
        end: seconds(character_end_times_seconds[i])
      }
      words.push(word)
    }
  })
  return words
}

// What a take actually says, from ElevenLabs' speech to text.
const transcribe = async (audio: Buffer) => {
  const form = new FormData()
  form.append("model_id", "scribe_v1")
  form.append("language_code", "en")
  form.append("tag_audio_events", "false")
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "take.mp3")
  return z
    .object({ text: z.string() })
    .parse(await (await request("/v1/speech-to-text", form)).json())
    .text.trim()
}

// A text's letters and digits, each with the index of its word, so spellings like "Co-packer" and "F.B.A." compare
// equal to "Copacker" and "FBA".
const lettersOf = (text: string) =>
  text
    .split(/\s+/)
    .flatMap((word, index) => [...word.toLowerCase()].filter((c) => /[a-z0-9]/.test(c)).map((c) => ({ c, index })))

// The words of `said` that `heard` mostly lacks: its letters lined up with the longest common subsequence, and a word
// counted as skipped when fewer than half of its letters were heard.
const unheard = (said: string, heard: string) => {
  const a = lettersOf(said)
  const b = lettersOf(heard)
  const lengths = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[i]!.c === b[j]!.c ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const matched = new Set<number>()
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i]!.c === b[j]!.c) {
      matched.add(i)
      i++
      j++
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      i++
    } else {
      j++
    }
  }
  return said.split(/\s+/).filter((word, index) => {
    const own = a.map((letter, i) => ({ ...letter, i })).filter((letter) => letter.index === index)
    return own.length > 0 && own.filter(({ i }) => matched.has(i)).length < own.length / 2
  })
}

// How a take reads back against its caption: the words it skipped, and any it added.
const compare = (caption: string, transcript: string) => ({
  skipped: unheard(caption, transcript),
  added: unheard(transcript, caption)
})

const describe = (id: string, transcript: string, { skipped, added }: ReturnType<typeof compare>) =>
  skipped.length === 0 && added.length === 0
    ? `${id}: ok\n`
    : `${id}: skipped [${skipped.join(" ")}] added [${added.join(" ")}]\n  heard: ${transcript}\n`

// Transcribes the takes, every line or only the ones named, and reports the words each one skipped or added.
const check = async (only: readonly string[]) => {
  for (const [id, line] of Object.entries(voiceover)) {
    if (only.length > 0 && !only.includes(id)) {
      continue
    }
    const transcript = await transcribe(await readFile(`public/voiceover/${id}.mp3`))
    process.stdout.write(describe(id, transcript, compare(line.caption, transcript)))
  }
}

// Reads one line, checking the take against its caption: Eleven v3 now and then drops a word, so a take that skips any
// is recorded again, up to four times, keeping the one that skipped the fewest.
const speak = async (voiceId: string, id: string, line: { caption: string; spoken: string }) => {
  let best: { take: z.infer<typeof Take>; skipped: string[] } | undefined
  for (let attempt = 1; attempt <= 4; attempt++) {
    const take = Take.parse(
      await (
        await request(`/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
          text: line.spoken,
          model_id: "eleven_v3"
        })
      ).json()
    )
    const { skipped } = compare(line.caption, await transcribe(Buffer.from(take.audio_base64, "base64")))
    if (!best || skipped.length < best.skipped.length) {
      best = { take, skipped }
    }
    if (skipped.length === 0) {
      break
    }
    process.stdout.write(`${id}: take ${attempt} skipped [${skipped.join(" ")}]\n`)
  }
  if (!best) {
    throw new Error(`No take of ${id}`)
  }
  if (best.skipped.length > 0) {
    process.stdout.write(`${id}: every take skipped a word; kept the one missing [${best.skipped.join(" ")}]\n`)
  }
  return best.take
}

// Records voiceover lines in one voice into public/voiceover/, with each take's word timings in
// src/voiceover-takes.json: every line, or only the ones named, keeping the takes of the rest. Afterwards,
// `pnpm --filter video audio` rebuilds the voiceover track the ad plays.
const record = async (voiceId: string, only: readonly string[]) => {
  const unknown = only.filter((id) => !Object.hasOwn(voiceover, id))
  if (unknown.length > 0) {
    throw new Error(`No voiceover line called ${unknown.join(", ")}`)
  }
  const kept = only.length > 0 ? await readTakes() : null
  if (kept && kept.voiceId !== voiceId) {
    throw new Error(`The other takes are in voice ${kept.voiceId}; record every line to change voices`)
  }
  await mkdir("public/voiceover", { recursive: true })
  const lines: Record<string, { start: number; end: number; words: Word[] }> = { ...kept?.lines }
  for (const [id, line] of Object.entries(voiceover)) {
    if (only.length > 0 && !only.includes(id)) {
      continue
    }
    const take = await speak(voiceId, id, line)
    await writeFile(`public/voiceover/${id}.mp3`, Buffer.from(take.audio_base64, "base64"))
    const words = wordsOf(take.alignment)
    const timing = { start: words[0].start, end: words[words.length - 1].end, words }
    lines[id] = timing
    process.stdout.write(`${id}: ${timing.start}s to ${timing.end}s\n`)
  }
  // In the voiceover's order, dropping takes of lines that no longer exist.
  const inOrder = Object.fromEntries(
    Object.keys(voiceover)
      .filter((id) => Object.hasOwn(lines, id))
      .map((id) => [id, lines[id]])
  )
  await writeFile("src/voiceover-takes.json", `${JSON.stringify({ voiceId, lines: inOrder }, null, 2)}\n`)
}

const [command, ...args] = process.argv.slice(2)
if (command === "voices") {
  await listVoices()
} else if (command === "audition" && args.length > 0) {
  await audition(args)
} else if (command === "record" && args.length > 0) {
  await record(args[0], args.slice(1))
} else if (command === "check") {
  await check(args)
} else {
  throw new Error(
    "Usage: elevenlabs.ts voices | audition <voice id>... | record <voice id> [line...] | check [line...]"
  )
}
