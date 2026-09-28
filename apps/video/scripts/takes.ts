// The voiceover takes' word timings, as src/voiceover-takes.json keeps them.
import { readFile } from "node:fs/promises"
import { z } from "zod"

export const Takes = z.object({
  voiceId: z.string(),
  lines: z.record(
    z.string(),
    z.object({
      start: z.number(),
      end: z.number(),
      words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() }))
    })
  )
})

export const readTakes = async () => Takes.parse(JSON.parse(await readFile("src/voiceover-takes.json", "utf8")))
