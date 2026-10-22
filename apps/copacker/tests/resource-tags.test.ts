import { describe, expect, it, vi } from "vitest"
import { reconcileResourceTags } from "../scripts/resource-tags"

const target = { type: "queue" as const, id: "queue-id", tags: { app: "copacker", environment: "preview" } }

describe("Cloudflare tag reconciliation", () => {
  it("preserves unrelated tags and conditionally repairs owned tags", () => {
    const run = vi
      .fn<Parameters<typeof reconcileResourceTags>[1]>()
      .mockReturnValueOnce({ etag: "version-1", tags: { owner: "team", app: "wrong" } })
      .mockReturnValueOnce({})
      .mockReturnValueOnce({ etag: "version-2", tags: { owner: "team", ...target.tags } })
    reconcileResourceTags(target, run)
    expect(run).toHaveBeenNthCalledWith(1, [
      "tags",
      "account-resources",
      "get",
      "--resource-type",
      "queue",
      "--resource-id",
      "queue-id"
    ])
    expect(run).toHaveBeenNthCalledWith(2, ["tags", "account-resources", "update", "--if-match", "version-1"], {
      resource_type: "queue",
      resource_id: "queue-id",
      tags: { owner: "team", ...target.tags }
    })
    expect(run).toHaveBeenCalledTimes(3)
  })
  it("does not write when owned tags already match", () => {
    const run = vi
      .fn<Parameters<typeof reconcileResourceTags>[1]>()
      .mockReturnValue({ etag: "version-1", tags: { owner: "team", ...target.tags } })
    reconcileResourceTags(target, run)
    expect(run).toHaveBeenCalledOnce()
  })
  it("fails without an unconditional retry when another writer changes the tags", () => {
    const run = vi
      .fn<Parameters<typeof reconcileResourceTags>[1]>()
      .mockReturnValueOnce({ etag: "version-1", tags: {} })
      .mockImplementationOnce(() => {
        throw new Error("precondition failed")
      })
    expect(() => reconcileResourceTags(target, run)).toThrow("precondition failed")
    expect(run).toHaveBeenCalledTimes(2)
  })
  it("rejects a successful update response if readback does not match", () => {
    const run = vi.fn<Parameters<typeof reconcileResourceTags>[1]>().mockReturnValue({ etag: "version-1", tags: {} })
    expect(() => reconcileResourceTags(target, run)).toThrow("Resource tags did not persist")
  })
  it("does not write when read permission or response validation fails", () => {
    const run = vi
      .fn<Parameters<typeof reconcileResourceTags>[1]>()
      .mockReturnValue({ errors: [{ message: "forbidden" }] })
    expect(() => reconcileResourceTags(target, run)).toThrow(/Invalid input/)
    expect(run).toHaveBeenCalledOnce()
  })
})
