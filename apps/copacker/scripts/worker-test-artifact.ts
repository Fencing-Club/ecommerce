import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { z } from "zod"

export const output = new URL("../.cloudflare/output/v0/workers/default/", import.meta.url)
export const artifact = z
  .object({
    compatibilityDate: z.string(),
    compatibilityFlags: z.array(z.string()),
    manifest: z.object({
      mainModule: z.string(),
      modules: z.record(z.string(), z.object({ type: z.enum(["esm", "data", "text", "wasm", "sourcemap"]) }))
    })
  })
  .parse(JSON.parse(await readFile(new URL("worker.config.json", output), "utf8")))
export const modules = Object.fromEntries(
  await Promise.all(
    Object.entries(artifact.manifest.modules)
      .filter(([, module]) => module.type !== "sourcemap")
      .map(async ([name, module]) => {
        assert(module.type !== "sourcemap")
        const bytes = await readFile(new URL(`bundle/${name}`, output))
        return [
          name,
          { type: module.type, contents: module.type === "esm" || module.type === "text" ? bytes.toString() : bytes }
        ]
      })
  )
)
