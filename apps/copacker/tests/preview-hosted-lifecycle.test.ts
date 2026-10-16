import type { execFileSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { removeHostedPreview, previewInventory, hostedPreviewNumbers } from "../scripts/preview-cloudflare"
import type { deployHostedPreview } from "../scripts/preview-hosting"
import { runPreview } from "../scripts/preview-runner"

const provider = vi.hoisted(() => ({
  remove: vi.fn<typeof removeHostedPreview>(),
  deploy: vi.fn<typeof deployHostedPreview>(),
  inventory: vi.fn<typeof previewInventory>(),
  numbers: vi.fn<typeof hostedPreviewNumbers>(),
  migrate: vi.fn<typeof execFileSync>()
}))
vi.mock("node:child_process", () => ({ execFileSync: provider.migrate }))
vi.mock("../scripts/preview-cloudflare", async (original) => ({
  ...(await original<typeof import("../scripts/preview-cloudflare")>()),
  removeHostedPreview: provider.remove,
  previewInventory: provider.inventory,
  hostedPreviewNumbers: provider.numbers
}))
vi.mock("../scripts/preview-hosting", () => ({ deployHostedPreview: provider.deploy }))
const request = vi.fn<typeof fetch>()
const sha = "a".repeat(40)
const preview = { id: "br-preview", name: "pr-42", parent_id: "br-staging", default: false }
function respond(value: unknown, status = 200) {
  request.mockResolvedValueOnce(new Response(JSON.stringify(value), { status }))
}
beforeEach(() => {
  vi.clearAllMocks()
  request.mockReset()
  provider.remove.mockReset()
  provider.deploy.mockResolvedValue({ app: "https://app.test", stories: "https://stories.test" })
  provider.numbers.mockReturnValue(new Set(["42"]))
  vi.stubGlobal("fetch", request)
  for (const [key, value] of Object.entries({
    PR_NUMBER: "42",
    NEON_PROJECT_ID: "project",
    NEON_STAGING_BRANCH_ID: "br-staging",
    NEON_DATABASE_NAME: "neondb",
    NEON_ROLE_NAME: "owner",
    NEON_API_KEY: "key",
    GH_TOKEN: "key",
    GITHUB_REPOSITORY: "test/repository",
    APP_COMMIT_SHA: sha,
    CLOUDFLARE_PREVIEW_CONFIG: JSON.stringify({
      accountId: "a".repeat(32),
      bucket: "copacker-staging-private",
      subdomain: "test",
      caCertificateId: "302d6a50-3f62-4d27-bbb6-4430e39c6163"
    })
  })) {
    vi.stubEnv(key, value)
  }
  vi.stubEnv("GITHUB_OUTPUT", undefined)
  vi.stubEnv("GITHUB_STEP_SUMMARY", undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("Preview merge and close races", () => {
  it("cleans up Cloudflare even if Neon already expired", async () => {
    respond({ branches: [] })
    respond({ state: "closed" })
    await runPreview("remove")
    expect(provider.remove).toHaveBeenCalledWith(expect.anything(), "42")
    expect(request.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false)
  })
  it("preserves a reopened PR when its earlier close event finally runs", async () => {
    respond({ branches: [preview] })
    respond({ state: "open" })
    await runPreview("remove")
    expect(provider.remove).not.toHaveBeenCalled()
  })
  it("does not recreate an already merged preview from a queued deployment", async () => {
    respond({ branches: [] })
    respond({ state: "closed" })
    await runPreview("deploy")
    expect(provider.remove).toHaveBeenCalled()
    expect(provider.deploy).not.toHaveBeenCalled()
    expect(provider.migrate).not.toHaveBeenCalled()
  })
  it("removes a PR that merges while hosting is being deployed", async () => {
    respond({ branches: [preview] })
    respond({ state: "open", head: { sha } })
    respond({ branch: preview })
    respond({ uri: "postgres://owner:secret@ep-test.neon.tech/neondb" })
    respond({ state: "closed" })
    respond({})
    respond({ branches: [] })
    await runPreview("deploy")
    expect(provider.deploy).toHaveBeenCalledOnce()
    expect(provider.remove).toHaveBeenCalledWith(expect.anything(), "42")
    expect(provider.remove.mock.invocationCallOrder[0]).toBeGreaterThan(provider.deploy.mock.invocationCallOrder[0]!)
  })
  it("preserves the database when Cloudflare cleanup needs retrying", async () => {
    respond({ branches: [preview] })
    respond({ state: "closed" })
    provider.remove.mockImplementation(() => {
      throw new Error("Cloudflare failure")
    })
    await expect(runPreview("remove")).rejects.toThrow("Cloudflare failure")
    expect(request.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false)
  })
  it("sweeps Cloudflare orphans and continues to other PRs after a GitHub lookup fails", async () => {
    provider.numbers.mockReturnValue(new Set(["42", "43", "44"]))
    respond({ branches: [] })
    respond({}, 404)
    respond({ state: "closed" })
    respond({ state: "open" })
    await expect(runPreview("sweep")).rejects.toThrow("cleanup incomplete for PRs 42")
    expect(provider.remove).toHaveBeenCalledExactlyOnceWith(expect.anything(), "43")
  })
  it("does not replace a newer PR revision with an outdated queued build", async () => {
    respond({ branches: [preview] })
    respond({ state: "open", head: { sha: "b".repeat(40) } })
    await runPreview("deploy")
    expect(provider.deploy).not.toHaveBeenCalled()
    expect(provider.migrate).not.toHaveBeenCalled()
  })
})
