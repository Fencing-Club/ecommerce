import { randomUUID, createHash } from "node:crypto"
import { readFile, rm } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { afterEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  source: new Map<string, { bytes: Buffer; type: string }>(),
  target: new Map<string, { bytes: Buffer; type: string }>(),
  references: ["invoice.pdf"],
  writes: 0
}))
vi.mock("pg", () => ({
  Client: class {
    connect = vi.fn<() => void>()
    end = vi.fn<() => void>()
    query = vi.fn<() => Promise<{ rows: { key: string }[] }>>(async () => ({
      rows: state.references.map((key) => ({ key }))
    }))
  }
}))
vi.mock("@aws-sdk/client-s3", async (original) => {
  const actual = await original<typeof import("@aws-sdk/client-s3")>()
  return {
    ...actual,
    S3Client: class {
      destroy = vi.fn<() => void>()
      async send(command: {
        constructor: { name: string }
        input: { Bucket: string; Key?: string; Body?: AsyncIterable<Buffer>; ContentType?: string; IfMatch?: string }
      }) {
        const { Bucket, Key, Body, ContentType, IfMatch } = command.input
        const store = Bucket === "source" ? state.source : state.target
        const etag = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
        if (command instanceof actual.ListObjectsV2Command) {
          return {
            Contents: [...store].map(([key, value]) => ({
              Key: key,
              Size: value.bytes.length,
              ETag: etag(value.bytes)
            }))
          }
        }
        if (command instanceof actual.PutObjectCommand) {
          const chunks: Buffer[] = []
          for await (const chunk of Body!) {
            chunks.push(chunk)
          }
          store.set(Key!, { bytes: Buffer.concat(chunks), type: ContentType! })
          state.writes++
          return {}
        }
        const object = store.get(Key!)
        if (!object) {
          throw new actual.NoSuchKey({ message: "Missing", $metadata: { httpStatusCode: 404 } })
        }
        if (IfMatch && IfMatch !== etag(object.bytes)) {
          throw new Error("Source changed")
        }
        return { ContentType: object.type, Body: Readable.from([object.bytes]) }
      }
    }
  }
})

const root = path.resolve(".cloudflare/storage-transfer")
const folders: string[] = []
const originalArgs = process.argv
afterEach(async () => {
  process.argv = originalArgs
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const folder of folders.splice(0)) {
    if (!folder.startsWith(`${root}${path.sep}`)) {
      throw new Error("Unexpected test directory")
    }
    await rm(folder, { recursive: true, force: true })
  }
})
function setup() {
  state.source.clear()
  state.target.clear()
  state.references = ["invoice.pdf"]
  state.writes = 0
  state.source.set("invoice.pdf", { bytes: Buffer.from("%PDF-test-private-file"), type: "application/pdf" })
  for (const prefix of ["SOURCE", "TARGET"]) {
    vi.stubEnv(`${prefix}_S3_ENDPOINT`, "http://127.0.0.1:9000")
    vi.stubEnv(`${prefix}_S3_BUCKET`, prefix.toLowerCase())
    vi.stubEnv(`${prefix}_S3_ACCESS_KEY_ID`, "test")
    vi.stubEnv(`${prefix}_S3_SECRET_ACCESS_KEY`, "test")
  }
  vi.stubEnv("DATABASE_URL", "postgres://test:test@127.0.0.1/test")
  const folder = path.join(root, `test-${randomUUID()}`)
  folders.push(folder)
  return folder
}
async function run(mode: string, folder: string) {
  vi.resetModules()
  process.argv = ["node", "storage-transfer.ts", mode, folder]
  await import("../scripts/storage-transfer")
}

it("copies privately, verifies bytes and metadata, resumes without writes, and detects target corruption", async () => {
  const folder = setup()
  await run("scan", folder)
  await run("copy", folder)
  expect(state.target.get("invoice.pdf")).toEqual(state.source.get("invoice.pdf"))
  expect(state.writes).toBe(1)
  await run("copy", folder)
  await run("verify", folder)
  expect(state.writes).toBe(1)
  expect(await readFile(path.join(folder, "verified.jsonl"), "utf8")).toContain('"sha256":')
  state.target.set("invoice.pdf", { bytes: Buffer.from("corrupted"), type: "application/pdf" })
  await expect(run("verify", folder)).rejects.toThrow("Destination content differs")
})

it("refuses missing database references and records target-only objects without deleting them", async () => {
  const folder = setup()
  state.references.push("missing.pdf")
  state.target.set("retained.pdf", { bytes: Buffer.from("keep"), type: "application/pdf" })
  await expect(run("scan", folder)).rejects.toThrow("Referenced objects are missing")
  const manifest = JSON.parse(await readFile(path.join(folder, "manifest.json"), "utf8"))
  expect(manifest.missing).toEqual(["missing.pdf"])
  expect(manifest.extraTargetKeys).toEqual(["retained.pdf"])
  await expect(run("copy", folder)).rejects.toThrow("Manifest has missing")
  expect(state.target.has("retained.pdf")).toBe(true)
})

it("refuses a changed source instead of claiming its earlier inventory is verified", async () => {
  const folder = setup()
  await run("scan", folder)
  state.source.set("invoice.pdf", { bytes: Buffer.from("changed"), type: "application/pdf" })
  await expect(run("copy", folder)).rejects.toThrow("Source changed")
  expect(state.writes).toBe(0)
})
