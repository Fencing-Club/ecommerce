import { createHash } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import invariant from "tiny-invariant"
import { z } from "zod"

function manifest(directory: string) {
  const entries = readdirSync(directory, { recursive: true, withFileTypes: true })
  invariant(
    entries.every((entry) => !entry.isSymbolicLink()),
    "Storybook artifact contains a symbolic link"
  )
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort()
  invariant(files.includes("index.html"), "Storybook artifact is missing index.html")
  const hash = createHash("sha256")
  for (const file of files) {
    hash.update(
      JSON.stringify([
        file,
        createHash("sha256")
          .update(readFileSync(path.join(directory, file)))
          .digest("hex")
      ])
    )
  }
  return hash.digest("hex")
}

const metadata = z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/), digest: z.string().regex(/^[a-f0-9]{64}$/) })
const location = (directory: string) => path.resolve(directory, "../.cloudflare/storybook-artifact.json")

export function sealStorybookArtifact(directory: string, commit: string) {
  const record = metadata.parse({ commit, digest: manifest(directory) })
  mkdirSync(path.dirname(location(directory)), { recursive: true })
  writeFileSync(location(directory), JSON.stringify(record))
}

export function verifyStorybookArtifact(directory: string, commit: string) {
  const record = metadata.parse(JSON.parse(readFileSync(location(directory), "utf8")))
  invariant(
    record.commit === commit && record.digest === manifest(directory),
    "Storybook artifact does not match the preview commit or contents"
  )
}
