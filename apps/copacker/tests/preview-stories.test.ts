import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { publishPreviewStories } from "../scripts/preview-stories"
import { PreviewTimings } from "../scripts/preview-timings"

const provider = vi.hoisted(() => ({ cloudflare: vi.fn<typeof import("../scripts/preview-cloudflare").cloudflare>() }))
vi.mock("../scripts/preview-cloudflare", () => provider)
const config = {
  accountId: "a".repeat(32),
  bucket: "copacker-staging-private" as const,
  subdomain: "test",
  caCertificateId: "302d6a50-3f62-4d27-bbb6-4430e39c6163"
}
let root: string
let directory: string
beforeEach(() => {
  vi.resetAllMocks()
  root = mkdtempSync(path.join(tmpdir(), "copacker-story-test-"))
  directory = path.join(root, "storybook-static")
  mkdirSync(directory)
  writeFileSync(path.join(directory, "index.html"), "hello")
  writeFileSync(path.join(directory, "bundle.js"), "export {}")
})
afterEach(() => {
  if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("copacker-story-test-")) {
    throw new Error("Unsafe temporary directory")
  }
  rmSync(root, { recursive: true, force: true })
})

it("publishes an isolated assets-only artifact with commit health, MIME protection and no private bindings", () => {
  const timings = new PreviewTimings()
  publishPreviewStories(config, "42", "a".repeat(40), directory, timings)
  const project = path.join(root, ".cloudflare/preview-stories")
  const worker = path.join(project, ".cloudflare/output/v0/workers/default")
  expect(JSON.parse(readFileSync(path.join(worker, "worker.config.json"), "utf8"))).toEqual({
    name: "copacker-stories-pr-42",
    compatibilityDate: "2026-10-17",
    workersDev: true,
    previewUrls: false,
    assets: { notFoundHandling: "none" },
    observability: { enabled: true, traces: { enabled: true }, redactQueryString: true },
    env: {}
  })
  expect(readFileSync(path.join(worker, "assets/index.html"), "utf8")).toBe("hello")
  expect(JSON.parse(readFileSync(path.join(worker, "assets/health.json"), "utf8"))).toEqual({ commit: "a".repeat(40) })
  expect(readFileSync(path.join(worker, "assets/_headers"), "utf8")).toContain("Cache-Control: no-store")
  expect(provider.cloudflare).toHaveBeenCalledTimes(2)
  expect(provider.cloudflare.mock.calls[0]![1]).toContain("--dry-run")
  expect(provider.cloudflare.mock.calls[1]![1]).not.toContain("--dry-run")
  expect(provider.cloudflare.mock.calls.every((call) => call[2]?.cwd === project)).toBe(true)
  expect(timings.finish().counts).toEqual({ storybookFiles: 2, storybookBytes: 14 })
})

it("does not deploy an artifact that fails validation", () => {
  provider.cloudflare.mockImplementationOnce(() => {
    throw new Error("invalid artifact")
  })
  expect(() => publishPreviewStories(config, "42", "a".repeat(40), directory)).toThrow("invalid artifact")
  expect(provider.cloudflare).toHaveBeenCalledTimes(1)
})

it("removes obsolete local assets before publishing a smaller build", () => {
  publishPreviewStories(config, "42", "a".repeat(40), directory)
  rmSync(path.join(directory, "bundle.js"))
  publishPreviewStories(config, "42", "b".repeat(40), directory)
  expect(() =>
    readFileSync(path.join(root, ".cloudflare/preview-stories/.cloudflare/output/v0/workers/default/assets/bundle.js"))
  ).toThrow("ENOENT")
})

it("rejects missing builds and unsafe PR identifiers before calling Cloudflare", () => {
  expect(() => publishPreviewStories(config, "../staging", "a".repeat(40), directory)).toThrow(/Invalid/)
  rmSync(path.join(directory, "index.html"))
  expect(() => publishPreviewStories(config, "42", "a".repeat(40), directory)).toThrow("missing index.html")
  expect(provider.cloudflare).not.toHaveBeenCalled()
})
