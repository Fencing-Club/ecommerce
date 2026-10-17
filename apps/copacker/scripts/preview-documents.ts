import { createHash } from "node:crypto"
import { rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Client } from "pg"
import invariant from "tiny-invariant"
import { z } from "zod"
import { databaseConfig } from "../src/db/connection"
import { storageReferenceQuery } from "../src/db/storage-references"
import { cloudflare, cloudflareAsync, previewObjects, type HostingSettings } from "./preview-cloudflare"
import { previewResources } from "./preview-config"
import type { PreviewTimings } from "./preview-timings"

function fingerprint(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex")
}

// Copy staging references once. A ready marker preserves the PR's edits on subsequent pushes.
export async function copyPreviewDocuments(
  config: HostingSettings,
  number: string,
  databaseUrl: URL,
  folder: string,
  timings: PreviewTimings
) {
  const prefix = previewResources(number).documentsPrefix
  const marker = `${prefix}.preview-ready`
  if (previewObjects(config, config.bucket, prefix).some((item) => item.key === marker)) {
    timings.count({ documentsReused: 1, documentFiles: 0, documentBytes: 0 })
    return
  }
  const client = new Client(databaseConfig("migration", { ...process.env, DIRECT_DATABASE_URL: databaseUrl.href }))
  await client.connect()
  let keys: string[]
  try {
    keys = [
      ...new Set(
        z
          .array(z.object({ key: z.string().min(1) }))
          .parse((await client.query(storageReferenceQuery)).rows)
          .map((item) => item.key)
      )
    ]
  } finally {
    await client.end()
  }
  const source = new Map(previewObjects(config, config.bucket, "").map((item) => [item.key, item]))
  invariant(
    keys.every((key) => source.has(key)),
    "Referenced staging files are missing from R2; synchronize staging storage before deploying previews"
  )
  let totalBytes = 0
  // Each batch settles before cleanup or failure. Unique scratch files prevent parallel copies from sharing bytes.
  for (let offset = 0; offset < keys.length; offset += 4) {
    const results = await Promise.allSettled(
      keys.slice(offset, offset + 4).map(async (key, index) => {
        const file = path.resolve(folder, `document-${offset + index}`)
        invariant(path.dirname(file) === path.resolve(folder), "Preview document scratch file escaped its directory")
        try {
          const bytes = Buffer.from(
            await cloudflareAsync(config, ["r2", "objects", "get", key, "--bucket-name", config.bucket], true)
          )
          await writeFile(file, bytes, { mode: 0o600 })
          await cloudflareAsync(config, [
            "r2",
            "objects",
            "put",
            `${prefix}${key}`,
            "--bucket-name",
            config.bucket,
            "--file",
            file,
            "--content-type",
            source.get(key)?.http_metadata?.contentType || "application/octet-stream"
          ])
          const copied = Buffer.from(
            await cloudflareAsync(
              config,
              ["r2", "objects", "get", `${prefix}${key}`, "--bucket-name", config.bucket],
              true
            )
          )
          invariant(fingerprint(copied) === fingerprint(bytes), "Preview file copy did not match staging")
          totalBytes += bytes.length
        } finally {
          await rm(file, { force: true })
        }
      })
    )
    const failed = results.find((result) => result.status === "rejected")
    if (failed) {
      throw new Error("Preview document copy incomplete; no ready marker was written. Retry the preview workflow.")
    }
  }
  cloudflare(config, ["r2", "objects", "put", marker, "--bucket-name", config.bucket, "--body", "ready"])
  timings.count({ documentsReused: 0, documentFiles: keys.length, documentBytes: totalBytes })
}
