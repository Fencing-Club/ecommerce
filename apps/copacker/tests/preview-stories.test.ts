import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { publishPreviewStories } from "../scripts/preview-stories"

const provider = vi.hoisted(() => ({
  cloudflare: vi.fn<typeof import("../scripts/preview-cloudflare").cloudflare>(),
  previewObjects: vi.fn<typeof import("../scripts/preview-cloudflare").previewObjects>(),
  uploadPreviewFile: vi.fn<typeof import("../scripts/preview-cloudflare").uploadPreviewFile>()
}))
vi.mock("../scripts/preview-cloudflare", () => provider)
const config = {
  accountId: "a".repeat(32),
  bucket: "copacker-staging-private" as const,
  subdomain: "test",
  caCertificateId: "302d6a50-3f62-4d27-bbb6-4430e39c6163"
}
let directory: string
beforeEach(() => {
  vi.resetAllMocks()
  directory = mkdtempSync(path.join(tmpdir(), "copacker-story-test-"))
  writeFileSync(path.join(directory, "index.html"), "hello")
  writeFileSync(path.join(directory, "bundle.js"), "export {}")
  provider.uploadPreviewFile.mockResolvedValue(undefined)
  provider.previewObjects.mockReturnValue([{ key: "previews/pr-42/storybook/old/index.html" }])
})
afterEach(() => {
  if (
    path.dirname(directory) !== path.resolve(tmpdir()) ||
    !path.basename(directory).startsWith("copacker-story-test-")
  ) {
    throw new Error("Unsafe temporary directory")
  }
  rmSync(directory, { recursive: true, force: true })
})

it("publishes only after every upload and removes only obsolete Storybook files", async () => {
  await publishPreviewStories(config, "42", "a".repeat(40), directory)
  expect(provider.uploadPreviewFile).toHaveBeenCalledTimes(2)
  expect(provider.uploadPreviewFile.mock.calls.map((call) => call[3]).sort()).toEqual([
    "text/html; charset=utf-8",
    "text/javascript; charset=utf-8"
  ])
  expect(Math.max(...provider.uploadPreviewFile.mock.invocationCallOrder)).toBeLessThan(
    provider.cloudflare.mock.invocationCallOrder[0]!
  )
  expect(provider.cloudflare.mock.calls[0]![1]).toContain("previews/pr-42/storybook/.release.json")
  expect(provider.previewObjects).toHaveBeenCalledWith(config, config.bucket, "previews/pr-42/storybook/")
  expect(provider.cloudflare.mock.calls[1]![2]).toEqual({ body: ["previews/pr-42/storybook/old/index.html"] })
})

it("keeps the previous publication intact if any file upload fails", async () => {
  provider.uploadPreviewFile.mockRejectedValueOnce(new Error("upload failed"))
  await expect(publishPreviewStories(config, "42", "a".repeat(40), directory)).rejects.toThrow("upload incomplete")
  expect(provider.cloudflare).not.toHaveBeenCalled()
  expect(provider.previewObjects).not.toHaveBeenCalled()
})
