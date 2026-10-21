import { describe, expect, it } from "vitest"
import { z } from "zod"
import { commands } from "./commands.ts"
import { canonicalJson, parseInput } from "./json.ts"
import { exitCode, isQuery, pageInfoSchema } from "./protocol.ts"
import { createRegistry, defineOperation } from "./registry.ts"

const definition = (name = "product.update") =>
  defineOperation(
    {
      operation: name,
      cliPath: name.split("."),
      context: "workspace",
      effects: [{ kind: "local_write", description: "Save metadata." }],
      accessPolicy: { scopes: ["products:write"], workspaceKinds: ["buyer"], description: "Products edit permission." },
      limits: { maxInputBytes: 1048576 },
      asyncStatusSchema: null,
      execution: {
        kind: "mutation",
        idempotent: true,
        confirmation: false,
        readBranches: [{ field: "mode", value: "read" }]
      }
    },
    z.strictObject({ mode: z.enum(["direct", "read"]), id: z.uuid() }),
    z.strictObject({ saved: z.boolean() })
  )

describe("portable contract", () => {
  it("rejects duplicate decoded keys, malformed JSON and non-object input", () => {
    for (const input of [
      '{"sku":"a","sku":"b"}',
      '{"a":{"x":1,"\\u0078":2}}',
      "[]",
      "null",
      '{"x":1,}',
      '{"x" 1}',
      '{"x":}',
      '{"x":"unterminated}',
      '{"x":1} extra'
    ]) {
      expect(() => parseInput(input)).toThrow(Error)
    }
    expect(parseInput('{"rows":[{"sku":"a\\\"b"},{"sku":"c"}],"value":-1.25e2,"ok":true,"nothing":null}')).toEqual({
      rows: [{ sku: 'a"b' }, { sku: "c" }],
      value: -125,
      ok: true,
      nothing: null
    })
    expect(() => parseInput(`{"x":"${"a".repeat(1048576)}"}`)).toThrow("1 MiB")
    expect(Object.getPrototypeOf(parseInput('{"__proto__":{"polluted":true}}'))).not.toHaveProperty("polluted")
  })
  it("canonicalizes object ordering while preserving ordinary array order", () => {
    expect(canonicalJson({ b: [2, 1], a: { z: 1, b: null } })).toBe(canonicalJson({ a: { b: null, z: 1 }, b: [2, 1] }))
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
  })
  it("keeps customer orders separate from POs and files under entities", () => {
    const names = commands.map((command) => command.operation)
    expect(new Set(names).size).toBe(names.length)
    for (const name of [
      "report.restock",
      "order.show",
      "po.show",
      "shipment.list",
      "partners.catalog.assign",
      "catalog.update",
      "inventory.update",
      "account.credential.rotate"
    ]) {
      expect(names).toContain(name)
    }
    expect(names.some((name) => /^(files?|imports?|jobs?|retry|overview|whoami|auth)\./.test(name))).toBe(false)
    expect(names).not.toContain("product.amazon.sku.update")
  })
  it("validates both handler inputs and outputs and rejects name collisions", async () => {
    const operation = definition()
    const registry = createRegistry([operation])
    expect(registry.get("product.update")).toBe(operation)
    expect(registry.list()).toHaveLength(1)
    await expect(
      registry.execute("product.update", { mode: "direct", id: "invalid" }, async () => ({ saved: true }))
    ).rejects.toThrow(Error)
    await expect(
      registry.execute(
        "product.update",
        { mode: "direct", id: "10000000-0000-4000-8000-000000000001" },
        async (_, mutation) => ({ saved: mutation })
      )
    ).resolves.toEqual({ saved: true })
    await expect(
      registry.execute("product.update", { mode: "read", id: "10000000-0000-4000-8000-000000000001" }, async () => ({
        invalid: true
      }))
    ).rejects.toThrow(Error)
    await expect(registry.execute("unknown", {}, async () => ({}))).rejects.toThrow("not registered")
    expect(() => createRegistry([operation, operation])).toThrow("Duplicate")
    expect(() => createRegistry([definition("product.foo-bar"), definition("product.foo.bar")])).toThrow("Duplicate")
    expect(isQuery(operation.descriptor, { mode: "read" })).toBe(true)
    expect(isQuery(operation.descriptor, { mode: "direct" })).toBe(false)
    expect(registry.openapi().paths).toHaveProperty("/api/operations/product.update")
  })
  it("checks cursor invariants and stable error exits", () => {
    expect(pageInfoSchema.safeParse({ nextCursor: null, hasMore: true, consistency: "live" }).success).toBe(false)
    const failure = { code: "partial_write", message: "", retryable: false, details: {}, issues: [], recovery: null }
    expect(exitCode(failure, 409)).toBe(9)
    for (const [status, expected] of [
      [400, 2],
      [401, 3],
      [403, 3],
      [404, 4],
      [409, 5],
      [410, 5],
      [429, 6],
      [503, 6],
      [500, 1]
    ]) {
      expect(exitCode({ ...failure, code: "other" }, status)).toBe(expected)
    }
    expect(exitCode({ ...failure, code: "wait_timeout" })).toBe(7)
    expect(exitCode({ ...failure, code: "incomplete_result" })).toBe(8)
  })
})
