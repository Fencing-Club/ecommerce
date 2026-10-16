import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { createWriteStream } from "node:fs"
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, NoSuchKey } from "@aws-sdk/client-s3"
import { Client } from "pg"
import invariant from "tiny-invariant"
import { z } from "zod"
import { directDatabase } from "../src/db/connection"
import { storageReferenceQuery } from "../src/db/storage-references"

export async function storageTransfer(modeInput: string | undefined, folderInput: string | undefined) {
  // An offline release tool. It never deletes objects or updates application rows. Run again after all writers stop;
  // reversing SOURCE/TARGET performs a reverse delta before restoring the old application's storage configuration.
  const mode = z.enum(["scan", "copy", "verify"]).parse(modeInput)
  const folder = path.resolve(z.string().min(1).parse(folderInput))
  const workspace = path.resolve(".cloudflare/storage-transfer")
  invariant(
    folder.startsWith(`${workspace}${path.sep}`),
    "Manifest directory must be inside .cloudflare/storage-transfer"
  )
  await mkdir(folder, { recursive: true })
  function endpoint(prefix: string) {
    const url = new URL(z.url().parse(process.env[`${prefix}_S3_ENDPOINT`]))
    invariant(url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname), "Storage requires HTTPS")
    invariant(!url.username && !url.password && !url.search, "Use separate storage credentials")
    const bucket = z.string().min(1).parse(process.env[`${prefix}_S3_BUCKET`])
    return {
      identity: { endpoint: url.origin, bucket },
      client: new S3Client({
        endpoint: url.href,
        region: "auto",
        forcePathStyle: true,
        // Keep streamed uploads fixed-length for S3-compatible stores; the tool verifies SHA-256 after every write.
        requestChecksumCalculation: "WHEN_REQUIRED",
        credentials: {
          accessKeyId: z.string().min(1).parse(process.env[`${prefix}_S3_ACCESS_KEY_ID`]),
          secretAccessKey: z.string().min(1).parse(process.env[`${prefix}_S3_SECRET_ACCESS_KEY`])
        }
      }),
      bucket
    }
  }
  const source = endpoint("SOURCE")
  const target = endpoint("TARGET")
  invariant(JSON.stringify(source.identity) !== JSON.stringify(target.identity), "Source and target must differ")
  const manifestPath = path.join(folder, "manifest.json")
  const journalPath = path.join(folder, "verified.jsonl")
  const entry = z.object({ key: z.string(), bytes: z.number().int().nonnegative(), etag: z.string() })
  const manifestSchema = z.object({
    source: z.object({ endpoint: z.string(), bucket: z.string() }),
    target: z.object({ endpoint: z.string(), bucket: z.string() }),
    createdAt: z.string(),
    objects: z.array(entry),
    referenced: z.array(z.string()),
    missing: z.array(z.string()),
    extraTargetKeys: z.array(z.string())
  })
  async function list(store: typeof source) {
    const objects: z.infer<typeof entry>[] = []
    let token: string | undefined
    do {
      const result = await store.client.send(
        new ListObjectsV2Command({ Bucket: store.bucket, ContinuationToken: token })
      )
      for (const object of result.Contents ?? []) {
        objects.push(entry.parse({ key: object.Key, bytes: object.Size, etag: object.ETag }))
      }
      token = result.IsTruncated ? result.NextContinuationToken : undefined
      invariant(!result.IsTruncated || token, "Incomplete bucket listing")
    } while (token)
    return objects.sort((a, b) => a.key.localeCompare(b.key))
  }
  async function references() {
    const client = new Client(directDatabase())
    await client.connect()
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      const result = await client.query(storageReferenceQuery)
      await client.query("COMMIT")
      return z
        .array(z.object({ key: z.string().min(1) }))
        .parse(result.rows)
        .map((row) => row.key)
        .sort()
    } finally {
      await client.end()
    }
  }
  async function fingerprint(store: typeof source, key: string) {
    try {
      const result = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key }))
      invariant(result.Body instanceof Readable, "Node storage response has no readable body")
      const hash = createHash("sha256")
      let bytes = 0
      for await (const chunk of result.Body) {
        hash.update(chunk)
        bytes += chunk.length
      }
      return { sha256: hash.digest("hex"), bytes, contentType: result.ContentType || "application/octet-stream" }
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return null
      }
      throw error
    }
  }
  try {
    if (mode === "scan") {
      const [objects, referenced, destination] = await Promise.all([list(source), references(), list(target)])
      const keys = new Set(objects.map((object) => object.key))
      const manifest = {
        source: source.identity,
        target: target.identity,
        createdAt: new Date().toISOString(),
        objects,
        referenced,
        missing: referenced.filter((key) => !keys.has(key)),
        // Review against the previous manifest and DB snapshot. Never infer a safe deletion from absence alone.
        extraTargetKeys: destination.filter((object) => !keys.has(object.key)).map((object) => object.key)
      }
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 })
      process.stdout.write(
        `Inventoried ${objects.length} objects (${objects.reduce((sum, object) => sum + object.bytes, 0)} bytes); ${manifest.missing.length} missing references; ${manifest.extraTargetKeys.length} target-only objects.\n`
      )
      invariant(manifest.missing.length === 0, "Referenced objects are missing; inspect the manifest before copying")
    } else {
      const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")))
      invariant(
        JSON.stringify(manifest.source) === JSON.stringify(source.identity) &&
          JSON.stringify(manifest.target) === JSON.stringify(target.identity),
        "Manifest belongs to different buckets"
      )
      invariant(manifest.missing.length === 0, "Manifest has missing referenced objects")
      for (const object of manifest.objects) {
        // Source If-Match detects writes since the inventory. A new scan is required after a source changes.
        const result = await source.client.send(
          new GetObjectCommand({ Bucket: source.bucket, Key: object.key, IfMatch: object.etag })
        )
        invariant(result.Body instanceof Readable, "Node source response has no readable body")
        const temp = path.join(folder, `${randomUUID()}.part`)
        try {
          let bytes = 0
          const hash = createHash("sha256")
          const digest = new Transform({
            transform(chunk, _encoding, done) {
              bytes += chunk.length
              hash.update(chunk)
              done(null, chunk)
            }
          })
          await pipeline(result.Body, digest, createWriteStream(temp, { flags: "wx", mode: 0o600 }))
          invariant(bytes === object.bytes, "Source size changed; rescan before continuing")
          const sha256 = hash.digest("hex")
          const contentType = result.ContentType || "application/octet-stream"
          let stored = await fingerprint(target, object.key)
          const equal = () => stored?.sha256 === sha256 && stored.bytes === bytes && stored.contentType === contentType
          if (!equal() && mode === "copy") {
            // PutObject is atomic. A crash before the journal append simply re-verifies this key on the next run.
            await target.client.send(
              new PutObjectCommand({
                Bucket: target.bucket,
                Key: object.key,
                Body: createReadStream(temp),
                ContentLength: bytes,
                ContentType: contentType,
                Metadata: result.Metadata,
                CacheControl: result.CacheControl,
                ContentDisposition: result.ContentDisposition
              })
            )
            stored = await fingerprint(target, object.key)
          }
          invariant(equal(), "Destination content differs; verification stopped")
          await appendFile(
            journalPath,
            `${JSON.stringify({ key: object.key, bytes, sha256, contentType, verifiedAt: new Date().toISOString() })}\n`,
            { mode: 0o600 }
          )
        } finally {
          await rm(temp, { force: true })
        }
      }
      process.stdout.write(
        `Verified every byte and content type of ${manifest.objects.length} objects. Re-scan after pausing all writers for the final delta.\n`
      )
    }
  } finally {
    source.client.destroy()
    target.client.destroy()
  }
}

if (import.meta.main) {
  await storageTransfer(process.argv[2], process.argv[3])
}
