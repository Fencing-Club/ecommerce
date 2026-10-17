import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { setTimeout } from "node:timers/promises"
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3ServiceException } from "@aws-sdk/client-s3"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { copyPreviewDocuments } from "../scripts/preview-documents"
import { PreviewTimings } from "../scripts/preview-timings"

type StorageCommand = GetObjectCommand | PutObjectCommand | HeadObjectCommand
type StorageResult = { Body?: Readable; ContentType?: string; Metadata?: Record<string, string> }
const provider = vi.hoisted(() => ({
  cloudflareJson: vi.fn<typeof import("../scripts/preview-cloudflare").cloudflareJson>(),
  send: vi.fn<(command: StorageCommand) => Promise<StorageResult>>(),
  destroy: vi.fn<() => void>(),
  client: vi.fn<(config: unknown) => void>()
}))
const database = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  query: vi.fn<() => Promise<{ rows: { key: string }[] }>>(),
  end: vi.fn<() => Promise<void>>()
}))
vi.mock("../scripts/preview-cloudflare", () => ({ cloudflareJson: provider.cloudflareJson }))
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...(await original<typeof import("@aws-sdk/client-s3")>()),
  S3Client: class {
    constructor(config: unknown) {
      provider.client(config)
    }
    send = provider.send
    destroy = provider.destroy
  }
}))
vi.mock("pg", () => ({
  Client: class {
    connect = database.connect
    query = database.query
    end = database.end
  }
}))
const config = {
  accountId: "a".repeat(32),
  bucket: "copacker-staging-private" as const,
  subdomain: "test",
  caCertificateId: "302d6a50-3f62-4d27-bbb6-4430e39c6163"
}
const url = new URL("postgresql://postgres:password@localhost/preview")
const prefix = "previews/pr-42/app/"
const source = new Map(Array.from({ length: 9 }, (_, i) => [`documents/${i}.pdf`, Buffer.from(`unique document ${i}`)]))
let folder: string
let active: number
let peak: number
let corrupt: boolean
let missing: boolean
let ready: boolean
let activeAtMarker: number
let uploaded: Map<string, Buffer>
function absent() {
  return new S3ServiceException({ name: "NotFound", $fault: "client", $metadata: { httpStatusCode: 404 } })
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(process.stdout, "write").mockReturnValue(true)
  folder = mkdtempSync(path.join(tmpdir(), "copacker-documents-test-"))
  active = 0
  peak = 0
  corrupt = false
  missing = false
  ready = false
  activeAtMarker = 0
  uploaded = new Map()
  database.query.mockResolvedValue({ rows: [...source.keys(), "documents/0.pdf"].map((key) => ({ key })) })
  provider.cloudflareJson.mockImplementation((_config, args) =>
    args[0] === "accounts"
      ? { id: "parent", status: "active" }
      : { accessKeyId: "temporary", secretAccessKey: "private", sessionToken: "private" }
  )
  provider.send.mockImplementation(async (command: GetObjectCommand | PutObjectCommand | HeadObjectCommand) => {
    const key = command.input.Key!
    if (command instanceof HeadObjectCommand) {
      if (ready) {
        return {}
      }
      throw absent()
    }
    active++
    peak = Math.max(peak, active)
    try {
      await setTimeout(5)
      if (command instanceof PutObjectCommand) {
        if (key.endsWith(".preview-ready")) {
          activeAtMarker = active
          ready = true
          return {}
        }
        const body = command.input.Body
        if (!(body instanceof Readable)) {
          throw new Error("Expected streamed upload")
        }
        const chunks: Buffer[] = []
        for await (const chunk of body) {
          chunks.push(Buffer.from(chunk))
        }
        uploaded.set(key, Buffer.concat(chunks))
        return {}
      }
      if (missing && key === "documents/0.pdf") {
        throw absent()
      }
      let bytes: Buffer | undefined = source.get(key)
      if (key.startsWith(prefix)) {
        bytes = corrupt ? Buffer.from("corrupted") : uploaded.get(key)
      }
      if (!bytes) {
        throw absent()
      }
      return { Body: Readable.from([bytes]), ContentType: "application/pdf", Metadata: { purpose: "fixture" } }
    } finally {
      active--
    }
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  if (
    path.dirname(folder) !== path.resolve(tmpdir()) ||
    !path.basename(folder).startsWith("copacker-documents-test-")
  ) {
    throw new Error("Unsafe temporary directory")
  }
  rmSync(folder, { recursive: true, force: true })
})

it("streams four copies at a time with scoped credentials and verifies bytes before marking ready", async () => {
  const timings = new PreviewTimings()
  await copyPreviewDocuments(config, "42", url, folder, timings)
  expect(peak).toBe(4)
  expect(active).toBe(0)
  expect(ready).toBe(true)
  expect(activeAtMarker).toBe(1)
  expect(provider.send.mock.calls.every(([command]) => command.input.Bucket === config.bucket)).toBe(true)
  expect(
    provider.send.mock.calls
      .filter(([command]) => command instanceof PutObjectCommand)
      .every(([command]) => command.input.Key?.startsWith(prefix))
  ).toBe(true)
  for (const [key, bytes] of source) {
    expect(uploaded.get(`${prefix}${key}`)).toEqual(bytes)
  }
  expect(readdirSync(folder)).toEqual([])
  expect(provider.cloudflareJson).toHaveBeenCalledTimes(3)
  expect(provider.cloudflareJson.mock.calls[1]![2]).toEqual({
    bucket: config.bucket,
    parentAccessKeyId: "parent",
    ttlSeconds: 1800,
    permission: "object-read-write",
    prefixes: [prefix]
  })
  expect(provider.cloudflareJson.mock.calls[2]![2]).toEqual({
    bucket: config.bucket,
    parentAccessKeyId: "parent",
    ttlSeconds: 1800,
    permission: "object-read-only",
    objects: [...source.keys()]
  })
  const uploads = provider.send.mock.calls
    .map(([command]) => command)
    .filter(
      (command): command is PutObjectCommand =>
        command instanceof PutObjectCommand && command.input.Key !== `${prefix}.preview-ready`
    )
  expect(
    uploads.every(
      (command) => command.input.ContentType === "application/pdf" && command.input.Metadata?.purpose === "fixture"
    )
  ).toBe(true)
  expect(provider.destroy).toHaveBeenCalledTimes(2)
  expect(timings.finish().counts).toEqual({
    documentsReused: 0,
    documentFiles: source.size,
    documentBytes: [...source.values()].reduce((sum, bytes) => sum + bytes.length, 0)
  })
})

it("drains a failed batch, starts no later copies, hides provider errors and leaves no ready marker", async () => {
  missing = true
  await expect(copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())).rejects.toThrow("copy incomplete")
  expect(active).toBe(0)
  expect(uploaded.size).toBe(3)
  expect(ready).toBe(false)
  expect(readdirSync(folder)).toEqual([])
  expect(provider.destroy).toHaveBeenCalledTimes(2)
})

it("rejects corrupted copies and safely retries incomplete transfers", async () => {
  corrupt = true
  await expect(copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())).rejects.toThrow("no ready marker")
  expect(ready).toBe(false)
  corrupt = false
  await copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())
  expect(uploaded.size).toBe(source.size)
  expect(ready).toBe(true)
})

it("preserves preview edits without a bucket listing or source credential on repeat pushes", async () => {
  ready = true
  const timings = new PreviewTimings()
  await copyPreviewDocuments(config, "42", url, folder, timings)
  expect(database.connect).not.toHaveBeenCalled()
  expect(provider.send).toHaveBeenCalledOnce()
  expect(provider.cloudflareJson).toHaveBeenCalledTimes(2)
  expect(provider.destroy).toHaveBeenCalledOnce()
  expect(timings.finish().counts).toEqual({ documentsReused: 1, documentFiles: 0, documentBytes: 0 })
})

it("does not mistake an authorization failure for a missing ready marker", async () => {
  provider.send.mockRejectedValueOnce(
    new S3ServiceException({
      name: "AccessDenied",
      message: "private provider token",
      $fault: "client",
      $metadata: { httpStatusCode: 403 }
    })
  )
  await expect(copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())).rejects.toThrow(
    /^Preview document copy incomplete;/
  )
  expect(database.connect).not.toHaveBeenCalled()
  expect(ready).toBe(false)
})

it("rejects references to another preview before minting source credentials", async () => {
  database.query.mockResolvedValue({ rows: [{ key: "previews/pr-420/app/private.pdf" }] })
  await expect(copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())).rejects.toThrow("copy incomplete")
  expect(provider.cloudflareJson).toHaveBeenCalledTimes(2)
  expect(provider.send).toHaveBeenCalledOnce()
  expect(ready).toBe(false)
})

it("can initialize an empty fixture database without unscoped source access", async () => {
  database.query.mockResolvedValue({ rows: [] })
  await copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())
  expect(provider.cloudflareJson).toHaveBeenCalledTimes(2)
  expect(ready).toBe(true)
})
