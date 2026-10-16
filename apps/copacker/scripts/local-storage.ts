import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { z } from "zod"

const credentials = z.object({ accessKeyId: z.string().min(16), secretAccessKey: z.string().min(32) })

// One worktree-local credential pair lets the retained Node worker use the web emulator's S3 endpoint.
// It is unrelated to any remote account and is never included in a deployed configuration.
export function localStorage() {
  const folder = new URL("../.cloudflare/", import.meta.url)
  const file = new URL("storage-credentials.json", folder)
  mkdirSync(folder, { recursive: true })
  if (!existsSync(file)) {
    try {
      writeFileSync(
        file,
        JSON.stringify({
          accessKeyId: randomBytes(16).toString("hex"),
          secretAccessKey: randomBytes(32).toString("hex")
        }),
        { flag: "wx", mode: 0o600 }
      )
    } catch (error) {
      // A simultaneously starting app/worker may have created the same worktree's file first.
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error
      }
    }
  }
  return {
    bucket: process.env.CLOUDFLARE_DOCUMENTS_BUCKET || "copacker-staging-private",
    credentials: credentials.parse(JSON.parse(readFileSync(fileURLToPath(file), "utf8")))
  }
}
