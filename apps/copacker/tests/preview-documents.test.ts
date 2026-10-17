import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { setTimeout } from "node:timers/promises"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { copyPreviewDocuments } from "../scripts/preview-documents"
import { PreviewTimings } from "../scripts/preview-timings"

const provider = vi.hoisted(() => ({
  cloudflare: vi.fn<typeof import("../scripts/preview-cloudflare").cloudflare>(),
  cloudflareAsync: vi.fn<typeof import("../scripts/preview-cloudflare").cloudflareAsync>(),
  previewObjects: vi.fn<typeof import("../scripts/preview-cloudflare").previewObjects>()
}))
const database = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  query: vi.fn<() => Promise<{ rows: { key: string }[] }>>(),
  end: vi.fn<() => Promise<void>>()
}))
vi.mock("../scripts/preview-cloudflare", () => provider)
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
let folder: string
let active: number
let peak: number
let corrupt: boolean
let missing: boolean
let ready: boolean
const source = new Map(Array.from({ length: 9 }, (_, i) => [`documents/${i}.pdf`, Buffer.from(`unique document ${i}`)]))
let uploaded: Map<string, Buffer<ArrayBuffer>>
let scratch: Set<string>
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(process.stdout, "write").mockReturnValue(true)
  folder = mkdtempSync(path.join(tmpdir(), "copacker-documents-test-"))
  active = 0
  peak = 0
  corrupt = false
  missing = false
  ready = false
  uploaded = new Map()
  scratch = new Set()
  database.query.mockResolvedValue({ rows: [...source.keys(), "documents/0.pdf"].map((key) => ({ key })) })
  provider.previewObjects.mockImplementation((_config, _bucket, requestedPrefix) => {
    if (requestedPrefix === prefix) {
      return ready ? [{ key: `${prefix}.preview-ready` }] : []
    }
    return [...source.keys()]
      .slice(missing ? 1 : 0)
      .map((key) => ({ key, http_metadata: { contentType: "application/pdf" } }))
  })
  provider.cloudflareAsync.mockImplementation(async (_config, args) => {
    active++
    peak = Math.max(peak, active)
    try {
      await setTimeout(5)
      const key = args[3]!
      if (args[2] === "put") {
        const file = args[args.indexOf("--file") + 1]!
        scratch.add(file)
        uploaded.set(key, readFileSync(file))
        return ""
      }
      if (key.startsWith(prefix)) {
        return corrupt ? Buffer.from("corrupted") : uploaded.get(key)!
      }
      return source.get(key)!
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

it("copies unique references four at a time, verifies distinct bytes and marks ready only after all transfers settle", async () => {
  const timings = new PreviewTimings()
  await copyPreviewDocuments(config, "42", url, folder, timings)
  expect(
    provider.cloudflareAsync.mock.calls
      .filter((call) => call[1][2] === "put")
      .every((call) => call[1][call[1].indexOf("--content-type") + 1] === "application/pdf")
  ).toBe(true)
  expect(peak).toBe(4)
  expect(active).toBe(0)
  expect(scratch.size).toBe(source.size)
  for (const [key, bytes] of source) {
    expect(uploaded.get(`${prefix}${key}`)).toEqual(bytes)
  }
  expect(provider.cloudflareAsync).toHaveBeenCalledTimes(source.size * 3)
  expect(provider.cloudflare.mock.calls[0]![1]).toContain(`${prefix}.preview-ready`)
  expect(provider.cloudflare.mock.invocationCallOrder[0]).toBeGreaterThan(
    Math.max(...provider.cloudflareAsync.mock.invocationCallOrder)
  )
  expect(readdirSync(folder)).toEqual([])
  expect(timings.finish().counts).toEqual({
    documentsReused: 0,
    documentFiles: source.size,
    documentBytes: [...source.values()].reduce((sum, bytes) => sum + bytes.length, 0)
  })
})

it("drains in-flight copies and never starts another batch or writes a marker after a failure", async () => {
  provider.cloudflareAsync.mockRejectedValueOnce(new Error("private provider failure"))
  await expect(copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())).rejects.toThrow("copy incomplete")
  expect(active).toBe(0)
  expect(uploaded.size).toBe(3)
  expect(readdirSync(folder)).toEqual([])
  expect(provider.cloudflare).not.toHaveBeenCalled()
})

it("rejects corrupted copies and can safely retry the incomplete batch", async () => {
  corrupt = true
  await expect(copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())).rejects.toThrow("no ready marker")
  expect(provider.cloudflare).not.toHaveBeenCalled()
  corrupt = false
  await copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())
  expect(uploaded.size).toBe(source.size)
  expect(provider.cloudflare).toHaveBeenCalledTimes(1)
})

it("preserves preview edits on a repeat push", async () => {
  ready = true
  const timings = new PreviewTimings()
  await copyPreviewDocuments(config, "42", url, folder, timings)
  expect(database.connect).not.toHaveBeenCalled()
  expect(provider.cloudflareAsync).not.toHaveBeenCalled()
  expect(provider.cloudflare).not.toHaveBeenCalled()
  expect(timings.finish().counts).toEqual({ documentsReused: 1, documentFiles: 0, documentBytes: 0 })
})

it("refuses an incomplete source inventory before transferring anything", async () => {
  missing = true
  await expect(copyPreviewDocuments(config, "42", url, folder, new PreviewTimings())).rejects.toThrow("missing from R2")
  expect(provider.cloudflareAsync).not.toHaveBeenCalled()
  expect(provider.cloudflare).not.toHaveBeenCalled()
  expect(database.end).toHaveBeenCalledOnce()
})
