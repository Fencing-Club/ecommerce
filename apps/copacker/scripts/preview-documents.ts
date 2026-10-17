import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { rm } from "node:fs/promises"
import path from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3"
import { Client } from "pg"
import invariant from "tiny-invariant"
import { z } from "zod"
import { databaseConfig } from "../src/db/connection"
import { storageReferenceQuery } from "../src/db/storage-references"
import { cloudflareJson, type HostingSettings } from "./preview-cloudflare"
import { previewResources } from "./preview-config"
import type { PreviewTimings } from "./preview-timings"

// cf manages credentials; the existing S3 client reuses connections for the data transfer.
// Neither temporary credential can reach production or another PR's destination.
function storageSession(config: HostingSettings) {
  const parent = z
    .object({ id: z.string().min(1), status: z.literal("active") })
    .parse(cloudflareJson(config, ["user", "tokens", "verify"]))
  return (
    scope:
      | { permission: "object-read-only"; objects: string[] }
      | { permission: "object-read-write"; prefixes: string[] }
  ) => {
    const credentials = z
      .object({ accessKeyId: z.string(), secretAccessKey: z.string(), sessionToken: z.string() })
      .parse(
        cloudflareJson(config, ["r2", "temporary-credentials", "create"], {
          bucket: config.bucket,
          parentAccessKeyId: parent.id,
          ttlSeconds: 1800,
          ...scope
        })
      )
    return new S3Client({
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      region: "auto",
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 10000, requestTimeout: 120000 },
      credentials
    })
  }
}

// Copy once, preserving PR edits after the ready marker. Batches drain before scratch files/clients are removed.
export async function copyPreviewDocuments(
  config: HostingSettings,
  number: string,
  databaseUrl: URL,
  folder: string,
  timings: PreviewTimings
) {
  const prefix = previewResources(number).documentsPrefix
  const marker = `${prefix}.preview-ready`
  let source: S3Client | undefined
  let target: S3Client | undefined
  let stage = "token verification"
  try {
    const session = storageSession(config)
    stage = "destination credentials"
    target = session({ permission: "object-read-write", prefixes: [prefix] })
    stage = "ready marker lookup"
    try {
      await target.send(new HeadObjectCommand({ Bucket: config.bucket, Key: marker }))
      timings.count({ documentsReused: 1, documentFiles: 0, documentBytes: 0 })
      return
    } catch (error) {
      if (!(error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)) {
        throw error
      }
    }
    stage = "database references"
    const client = new Client(databaseConfig("migration", { ...process.env, DIRECT_DATABASE_URL: databaseUrl.href }))
    let keys: string[]
    try {
      await client.connect()
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
    invariant(
      keys.every((key) => !key.startsWith("previews/") && key !== ".preview-ready"),
      "Invalid staging document reference"
    )
    if (keys.length) {
      stage = "source credentials"
      source = session({ permission: "object-read-only", objects: keys })
    }
    stage = "document transfer and verification"
    let totalBytes = 0
    for (let offset = 0; offset < keys.length; offset += 4) {
      const results = await Promise.allSettled(
        keys.slice(offset, offset + 4).map(async (key, index) => {
          const file = path.resolve(folder, `document-${offset + index}`)
          invariant(path.dirname(file) === path.resolve(folder), "Preview scratch file escaped its directory")
          try {
            const original = await source!.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
            invariant(original.Body instanceof Readable, "Missing staging file stream")
            const hash = createHash("sha256")
            let bytes = 0
            await pipeline(
              original.Body,
              new Transform({
                transform(chunk, _encoding, done) {
                  hash.update(chunk)
                  bytes += chunk.length
                  done(null, chunk)
                }
              }),
              createWriteStream(file, { flags: "wx", mode: 0o600 })
            )
            const contentType = original.ContentType || "application/octet-stream"
            const upload = createReadStream(file)
            try {
              await target!.send(
                new PutObjectCommand({
                  Bucket: config.bucket,
                  Key: `${prefix}${key}`,
                  Body: upload,
                  ContentLength: bytes,
                  ContentType: contentType,
                  Metadata: original.Metadata,
                  ContentDisposition: original.ContentDisposition,
                  ContentEncoding: original.ContentEncoding,
                  CacheControl: original.CacheControl
                })
              )
            } finally {
              upload.destroy()
            }
            const copied = await target!.send(new GetObjectCommand({ Bucket: config.bucket, Key: `${prefix}${key}` }))
            invariant(copied.Body instanceof Readable, "Missing copied file stream")
            const copiedHash = createHash("sha256")
            let copiedBytes = 0
            for await (const chunk of copied.Body) {
              copiedHash.update(chunk)
              copiedBytes += chunk.length
            }
            invariant(
              copiedHash.digest("hex") === hash.digest("hex") &&
                copiedBytes === bytes &&
                copied.ContentType === contentType,
              "Preview file copy did not match staging"
            )
            totalBytes += bytes
          } finally {
            await rm(file, { force: true })
          }
        })
      )
      invariant(
        results.every((result) => result.status === "fulfilled"),
        "Incomplete document batch"
      )
    }
    stage = "ready marker write"
    await target.send(new PutObjectCommand({ Bucket: config.bucket, Key: marker, Body: "ready" }))
    timings.count({ documentsReused: 0, documentFiles: keys.length, documentBytes: totalBytes })
  } catch {
    // Only our fixed stage names reach logs; provider errors can contain credentials or document keys.
    throw new Error(`Preview document copy incomplete; failed during ${stage}; no ready marker was confirmed.`)
  } finally {
    source?.destroy()
    target?.destroy()
  }
}
