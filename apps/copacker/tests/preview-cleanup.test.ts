import type { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  hostedPreviewNumbers,
  previewInventory,
  provisionHostedPreview,
  removeHostedPreview
} from "../scripts/preview-cloudflare"

const child = vi.hoisted(() => ({ execFileSync: vi.fn<typeof execFileSync>() }))
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  ...child
}))
const config = {
  accountId: "a".repeat(32),
  bucket: "copacker-staging-private" as const,
  subdomain: "test",
  caCertificateId: "302d6a50-3f62-4d27-bbb6-4430e39c6163"
}
let workers: { id: string; name: string }[]
let hyperdrives: { id: string; name: string }[]
let queues: { queue_id: string; queue_name: string }[]
let keys: string[]
let fail: string | undefined
let aborted: boolean

beforeEach(() => {
  workers = [
    { id: "web", name: "copacker-pr-42" },
    { id: "stories", name: "copacker-stories-pr-42" },
    { id: "other-stories", name: "copacker-stories-pr-420" },
    { id: "staging", name: "copacker-staging" },
    { id: "other", name: "copacker-pr-420" }
  ]
  hyperdrives = [
    { id: "preview", name: "copacker-pr-42" },
    { id: "production", name: "copacker" }
  ]
  queues = [
    { queue_id: "queue", queue_name: "copacker-jobs-pr-42" },
    { queue_id: "stage", queue_name: "copacker-jobs-staging" }
  ]
  keys = ["documents/staging.pdf", "invoice.pdf", "previews/pr-42/a", "previews/pr-42/b", "previews/pr-420/keep"]
  fail = undefined
  aborted = false
  child.execFileSync.mockReset()
  child.execFileSync.mockImplementation((_file, input) => {
    const args = Array.from(input || []).slice(1)
    const flag = (name: string) => args[args.indexOf(name) + 1]!
    const operation = args.slice(0, args[0] === "r2" ? 3 : 2).join(" ")
    if (operation === fail) {
      const body = args.includes("--body") ? readFileSync(flag("--body").slice(1), "utf8") : ""
      throw Object.assign(new Error("private provider details"), {
        stderr: `┌ APIError\n│ [2013] Invalid database credentials ${body}\n│ 400 Bad Request\n└`
      })
    }
    switch (operation) {
      case "workers list":
        return JSON.stringify(flag("--page") === "1" ? workers : [])
      case "hyperdrive list":
        return JSON.stringify(flag("--page") === "1" ? hyperdrives : [])
      case "queues list":
        return JSON.stringify(queues)
      case "r2 objects list":
        return JSON.stringify(
          keys
            .filter(
              (key) =>
                key.startsWith(flag("--prefix")) && (!args.includes("--start-after") || key > flag("--start-after"))
            )
            .slice(0, 2)
            .map((key) => ({ key }))
        )
      case "workers delete":
        if (!aborted) {
          workers = workers.filter((item) => item.id !== args[2])
        }
        return ""
      case "hyperdrive delete":
        hyperdrives = hyperdrives.filter((item) => item.id !== args[2])
        return ""
      case "queues delete":
        queues = queues.filter((item) => item.queue_id !== args[2])
        return ""
      case "r2 objects bulk-delete": {
        const removed: string[] = JSON.parse(readFileSync(flag("--body").slice(1), "utf8"))
        keys = keys.filter((key) => !removed.includes(key))
        return ""
      }
      default:
        throw new Error(`Unexpected operation ${operation}`)
    }
  })
})
afterEach(() => vi.restoreAllMocks())

describe("Cloudflare preview teardown", () => {
  it("deletes more than one bulk batch without placing long object keys in command arguments", () => {
    keys = Array.from(
      { length: 1001 },
      (_, index) => `previews/pr-42/${String(index).padStart(4, "0")}-${"x".repeat(900)}`
    )
    removeHostedPreview(config, "42")
    expect(keys).toEqual([])
    const deletes = child.execFileSync.mock.calls.filter(([, args]) => args?.includes("bulk-delete"))
    expect(deletes).toHaveLength(2)
    expect(deletes.every(([, args]) => args !== undefined && args.join(" ").length < 1000)).toBe(true)
  })
  it("removes all preview resources without touching staging files in the same bucket or another PR", () => {
    removeHostedPreview(config, "42")
    expect(workers.map((item) => item.name)).toEqual(["copacker-stories-pr-420", "copacker-staging", "copacker-pr-420"])
    expect(hyperdrives.map((item) => item.name)).toEqual(["copacker"])
    expect(queues.map((item) => item.queue_name)).toEqual(["copacker-jobs-staging"])
    expect(keys).toEqual(["documents/staging.pdf", "invoice.pdf", "previews/pr-420/keep"])
    expect(() => removeHostedPreview(config, "42")).not.toThrow()
  })

  it("finds file-only, Storybook-only, Hyperdrive-only and queue-only leftovers without a Neon branch", () => {
    workers = [{ id: "orphan", name: "copacker-stories-pr-16" }]
    hyperdrives = [{ id: "orphan", name: "copacker-pr-12" }]
    queues = [{ queue_id: "orphan", queue_name: "copacker-jobs-pr-13" }]
    keys = ["previews/pr-14/a", "previews/pr-14/b", "previews/pr-15/late-page", "production/no"]
    expect([...hostedPreviewNumbers(previewInventory(config))].sort()).toEqual(["12", "13", "14", "15", "16"])
  })

  it("preserves files and database connections when a Worker deletion fails or is silently aborted", () => {
    aborted = true
    expect(() => removeHostedPreview(config, "42")).toThrow("still exists")
    expect(keys).toContain("previews/pr-42/a")
    expect(hyperdrives.some((item) => item.id === "preview")).toBe(true)
    fail = "workers delete"
    expect(() => removeHostedPreview(config, "42")).toThrow("Cloudflare workers delete failed")
  })

  it("finishes independent cleanup after a partial failure, reports failure, and succeeds when retried", () => {
    fail = "hyperdrive delete"
    expect(() => removeHostedPreview(config, "42")).toThrow("cleanup incomplete (Hyperdrive)")
    expect(workers.some((item) => item.id === "web")).toBe(false)
    expect(queues.some((item) => item.queue_id === "queue")).toBe(false)
    expect(keys).toEqual(["documents/staging.pdf", "invoice.pdf", "previews/pr-420/keep"])
    fail = undefined
    removeHostedPreview(config, "42")
    expect(hyperdrives).toEqual([{ id: "production", name: "copacker" }])
  })

  it("reports Cloudflare's error code without any value it was sent, such as the database password", () => {
    fail = "hyperdrive create"
    hyperdrives = []
    const database = new URL(
      "postgresql://neondb_owner:s3cret-pass@ep-preview.aws.neon.tech/neondb?sslmode=verify-full"
    )
    const failure = (() => {
      try {
        provisionHostedPreview(config, "42", database)
      } catch (error) {
        return String(error)
      }
    })()
    expect(failure).toContain("Cloudflare hyperdrive create failed ([2013] Invalid database credentials")
    expect(failure).not.toMatch(/s3cret-pass|neondb_owner|ep-preview|400 Bad Request/)
  })

  it.each(["0", "../", "42/", "production"])(
    "refuses unsafe cleanup identifiers %s before calling Cloudflare",
    (number) => {
      expect(() => removeHostedPreview(config, number)).toThrow(/Invalid/)
      expect(child.execFileSync).not.toHaveBeenCalled()
    }
  )
})
