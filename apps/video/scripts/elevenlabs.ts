// The ad's voice, from ElevenLabs. `voices` lists the voices the key can use; `audition <voice id>...` reads the whole
// voiceover in each voice into out/auditions/, for choosing one; `record <voice id>` records the ad's takes, line by
// line. The key comes from ELEVENLABS_API_KEY in .env.
import { mkdir, writeFile } from "node:fs/promises"
import { z } from "zod"
import { voiceover } from "../src/voiceover.ts"

const key = process.env.ELEVENLABS_API_KEY
if (!key) {
  throw new Error("Set ELEVENLABS_API_KEY in apps/video/.env")
}

const request = async (path: string, body?: object) => {
  const response = await fetch(`https://api.elevenlabs.io${path}`, {
    method: body ? "POST" : "GET",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
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

// Records every voiceover line in one voice into public/voiceover/, with each take's word timings in
// src/voiceover-takes.json.
const record = async (voiceId: string) => {
  await mkdir("public/voiceover", { recursive: true })
  const lines: Record<string, { start: number; end: number; words: Word[] }> = {}
  for (const [id, line] of Object.entries(voiceover)) {
    const take = Take.parse(
      await (
        await request(`/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
          text: line.spoken,
          model_id: "eleven_v3"
        })
      ).json()
    )
    await writeFile(`public/voiceover/${id}.mp3`, Buffer.from(take.audio_base64, "base64"))
    const words = wordsOf(take.alignment)
    const timing = { start: words[0].start, end: words[words.length - 1].end, words }
    lines[id] = timing
    process.stdout.write(`${id}: ${timing.start}s to ${timing.end}s\n`)
  }
  await writeFile("src/voiceover-takes.json", `${JSON.stringify({ voiceId, lines }, null, 2)}\n`)
}

const [command, ...args] = process.argv.slice(2)
if (command === "voices") {
  await listVoices()
} else if (command === "audition" && args.length > 0) {
  await audition(args)
} else if (command === "record" && args.length === 1) {
  await record(args[0])
} else {
  throw new Error("Usage: elevenlabs.ts voices | audition <voice id>... | record <voice id>")
}
