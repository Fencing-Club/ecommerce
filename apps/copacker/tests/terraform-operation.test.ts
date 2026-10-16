import { describe, expect, it, vi } from "vitest"
import {
  backupState,
  planPrefix,
  planSummary,
  sha256,
  validateApprovedPlan,
  writeVerified,
  type PrivateStore
} from "../scripts/terraform-operation"

const now = new Date("2026-10-16T22:00:00Z")
const snapshot = Buffer.from(
  JSON.stringify({ version: 4, serial: 7, lineage: "e25c3b68-fc24-c311-0511-f172be1bbf76", secret: "private" })
)
const bytes = Buffer.from("saved plan")
const record = {
  environment: "production" as const,
  commit: "a".repeat(40),
  runId: "123",
  attempt: "1",
  createdAt: now.toISOString(),
  sha256: sha256(bytes),
  stateSha256: sha256(snapshot)
}
const expected = {
  environment: record.environment,
  commit: record.commit,
  runId: "123",
  attempt: "1",
  sha256: record.sha256
}

describe("saved Terraform plan approval", () => {
  it("accepts the exact reviewed artifact against unchanged state", () => {
    expect(() => validateApprovedPlan(record, bytes, snapshot, expected, now)).not.toThrow()
  })
  it.each([
    { environment: "staging" },
    { commit: "b".repeat(40) },
    { runId: "124" },
    { attempt: "2" },
    { sha256: "0".repeat(64) }
  ])("rejects a different approved identity %o", (change) => {
    expect(() => validateApprovedPlan(record, bytes, snapshot, { ...expected, ...change }, now)).toThrow(
      /saved plan|digest/
    )
  })
  it("rejects replaced bytes and intervening state changes", () => {
    expect(() => validateApprovedPlan(record, Buffer.from("replacement"), snapshot, expected, now)).toThrow(/digest/)
    expect(() => validateApprovedPlan(record, bytes, Buffer.from("changed state"), expected, now)).toThrow(
      /State changed/
    )
  })
  it.each([-1, 2 * 60 * 60 * 1000 + 1])("rejects a future or expired plan", (elapsed) => {
    expect(() => validateApprovedPlan(record, bytes, snapshot, expected, new Date(now.getTime() + elapsed))).toThrow(
      /expired/
    )
  })
  it("rejects object-key traversal and non-environment names", () => {
    expect(() => planPrefix("production", "../123", "1")).toThrow(/Invalid/)
    expect(() => planPrefix("preview", "123", "1")).toThrow(/Invalid/)
  })
  it("never includes resource values or outputs in the CI summary", () => {
    const summary = planSummary({
      resource_changes: [
        {
          address: "resource.changed",
          change: { actions: ["update"], before: { password: "secret" }, after: { password: "new-secret" } }
        },
        { address: "resource.unchanged", change: { actions: ["no-op"] } }
      ],
      output_changes: { password: { after: "output-secret" } }
    })
    expect(summary).toEqual([{ address: "resource.changed", actions: ["update"] }])
    expect(JSON.stringify(summary)).not.toContain("secret")
  })
})

describe("private Terraform state recovery", () => {
  it("preserves the live state and verifies a separately retrieved backup", async () => {
    const objects = new Map<string, Buffer>([["copacker/production/terraform.tfstate", snapshot]])
    const store: PrivateStore = {
      read: async (key) => {
        const value = objects.get(key)
        if (!value) {
          throw new Error("missing")
        }
        return value
      },
      write: async (key, value) => {
        objects.set(key, value)
      }
    }
    const restore = vi.fn<(bytes: Buffer) => void>()
    const first = await backupState(store, "production", restore, now)
    const second = await backupState(store, "production", restore, now)
    expect(first.key).not.toBe(second.key)
    expect(first.key).toMatch(/^backups\/copacker\/production\/terraform.tfstate\//)
    expect(objects.get("copacker/production/terraform.tfstate")).toEqual(snapshot)
    expect(restore).toHaveBeenCalledWith(snapshot)
    expect(first.serial).toBe(7)
  })
  it("fails if readback is corrupted or recovery verification fails", async () => {
    const store: PrivateStore = {
      read: vi.fn<PrivateStore["read"]>().mockResolvedValue(Buffer.from("corrupt")),
      write: vi.fn<PrivateStore["write"]>()
    }
    await expect(writeVerified(store, "backup", snapshot)).rejects.toThrow(/readback/)
    const restore = vi.fn<(bytes: Buffer) => Promise<void>>().mockRejectedValue(new Error("unreadable state"))
    store.read = vi.fn<PrivateStore["read"]>().mockResolvedValue(snapshot)
    await expect(backupState(store, "production", restore, now)).rejects.toThrow("unreadable state")
  })
  it("does not create a backup of malformed state", async () => {
    const store: PrivateStore = {
      read: vi.fn<PrivateStore["read"]>().mockResolvedValue(Buffer.from("{}")),
      write: vi.fn<PrivateStore["write"]>()
    }
    await expect(backupState(store, "production", vi.fn<(bytes: Buffer) => void>(), now)).rejects.toThrow(/Invalid/)
    expect(store.write).not.toHaveBeenCalled()
  })
})
