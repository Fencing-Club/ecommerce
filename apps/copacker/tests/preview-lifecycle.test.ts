import type { execFileSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runPreview as run } from "../scripts/preview-runner"

const child = vi.hoisted(() => ({ execFileSync: vi.fn<typeof execFileSync>() }))
vi.mock("node:child_process", () => child)
const fetchMock = vi.fn<typeof fetch>()
const branch = { id: "br-preview", name: "pr-42", parent_id: "br-staging", default: false }

function respond(value: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(value), { status }))
}

beforeEach(() => {
  fetchMock.mockReset()
  child.execFileSync.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  for (const [name, value] of Object.entries({
    PR_NUMBER: "42",
    NEON_PROJECT_ID: "test-project",
    NEON_STAGING_BRANCH_ID: "br-staging",
    NEON_DATABASE_NAME: "neondb",
    NEON_ROLE_NAME: "neondb_owner",
    NEON_API_KEY: "test-key",
    GH_TOKEN: "test-github-key",
    GITHUB_REPOSITORY: "test/repository"
  })) {
    vi.stubEnv(name, value)
  }
  vi.stubEnv("GITHUB_OUTPUT", undefined)
  vi.stubEnv("GITHUB_STEP_SUMMARY", undefined)
  vi.stubEnv("CLOUDFLARE_PREVIEW_CONFIG", undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("Neon preview lifecycle", () => {
  it("creates a staging child and migrates its direct connection with verified TLS", async () => {
    respond({ branches: [] })
    respond({ branch })
    respond({ uri: "postgresql://owner:secret@ep-test.neon.tech/neondb?sslmode=require" })
    await run("deploy")
    const creation = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))
    expect(creation.branch).toMatchObject({ name: "pr-42", parent_id: "br-staging" })
    expect(creation.endpoints[0]).not.toHaveProperty("suspend_timeout_seconds")
    expect(String(fetchMock.mock.calls[2]![0])).toContain("branch_id=br-preview")
    expect(String(fetchMock.mock.calls[2]![0])).toContain("pooled=false")
    expect(child.execFileSync).toHaveBeenCalledWith(
      process.execPath,
      ["--import", "tsx", "scripts/migrate.ts"],
      expect.objectContaining({
        env: expect.objectContaining({
          DIRECT_DATABASE_URL: "postgresql://owner:secret@ep-test.neon.tech/neondb?sslmode=verify-full"
        })
      })
    )
  })

  it("extends the existing branch without replacing its test data", async () => {
    respond({ branches: [branch] })
    respond({ branch })
    respond({ uri: "postgresql://owner:secret@ep-test.neon.tech/neondb" })
    await run("deploy")
    expect(fetchMock.mock.calls[1]![1]!.method).toBe("PATCH")
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/branches/br-preview")
    expect(child.execFileSync).toHaveBeenCalledOnce()
  })

  it("tolerates cleanup after automatic expiration", async () => {
    respond({ branches: [] })
    await run("remove")
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(child.execFileSync).not.toHaveBeenCalled()
  })

  it("sweeps every page and removes only confirmed closed staging children", async () => {
    respond({ branches: [branch], pagination: { next: "next-page" } })
    respond({ branches: [{ ...branch, id: "br-closed", name: "pr-43" }] })
    respond({ state: "open" })
    respond({ state: "closed" })
    respond({})
    respond({ branches: [] })
    await run("sweep")
    expect(String(fetchMock.mock.calls[1]![0])).toContain("cursor=next-page")
    const deleted = fetchMock.mock.calls.filter(([, options]) => options?.method === "DELETE")
    expect(deleted).toHaveLength(1)
    expect(String(deleted[0]![0])).toContain("/branches/br-closed")
  })

  it("preserves the branch when GitHub cannot confirm the PR's state", async () => {
    respond({ branches: [branch] })
    respond({}, 404)
    await expect(run("sweep")).rejects.toThrow("Preview cleanup incomplete for PRs 42")
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false)
  })

  it("does not expose connection credentials or copied rows in migration failures", async () => {
    respond({ branches: [branch] })
    respond({ branch })
    respond({ uri: "postgresql://owner:secret@ep-test.neon.tech/neondb" })
    child.execFileSync.mockImplementation(() => {
      throw new Error("secret and copied customer record")
    })
    await expect(run("deploy")).rejects.toThrow(/^Migrations failed on Neon branch br-preview;/)
  })
})
