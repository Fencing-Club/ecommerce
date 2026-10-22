import {
  accountShow,
  contractVersion,
  defineOperation,
  jsonObject,
  type JsonObject,
  type SuccessEnvelope
} from "@repo/copacker-contract"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { apiOrigin, clientError, CopackerClient, delay } from "../src/client.ts"

const workspace = "10000000-0000-4000-8000-000000000001"
const envelope = (
  data: SuccessEnvelope["data"],
  completeness: "complete" | "partial" = "complete"
): SuccessEnvelope => ({
  data,
  meta: {
    requestId: "test",
    workspaceId: workspace,
    generatedAt: "2026-10-15T00:00:00Z",
    completeness,
    sources: [],
    warnings: [],
    redactedFields: []
  }
})
const definition = (name: string, mutation = false) =>
  defineOperation(
    {
      operation: name,
      cliPath: name.split("."),
      context: "workspace",
      effects: [],
      accessPolicy: { scopes: [], workspaceKinds: ["buyer"], description: "Fixture." },
      limits: { maxInputBytes: 1048576 },
      asyncStatusSchema: null,
      execution: {
        kind: mutation ? "mutation" : "query",
        idempotent: true,
        confirmation: false,
        readBranches: [{ field: "mode", value: "read" }]
      }
    },
    z.strictObject({ cursor: z.string().optional(), mode: z.string().optional() }),
    z.json()
  ).descriptor
function fixture(
  operation = "order.list",
  mutation = false,
  respond: (body: JsonObject, attempt: number) => Response = () => Response.json(envelope({ ok: true }))
) {
  let calls = 0
  const requests: RequestInit[] = []
  const fetcher: typeof fetch = async (url, init) => {
    requests.push(init ?? {})
    if (String(url).endsWith("schema.show")) {
      return Response.json(envelope(definition(operation, mutation)))
    }
    const body = z.object({ input: z.record(z.string(), z.json()) }).parse(JSON.parse(String(init?.body)))
    return respond(body.input, calls++)
  }
  return {
    client: new CopackerClient({
      baseUrl: "https://copacker.test",
      token: "private-secret",
      workspaceId: workspace,
      fetch: fetcher,
      sleep: async () => undefined
    }),
    requests
  }
}

describe("operation client", () => {
  it("pins credentials and transfers to a secure origin and refuses redirects", async () => {
    for (const url of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com/?token=x"
    ]) {
      expect(() => apiOrigin(url)).toThrow(Error)
    }
    expect(apiOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000")
    const { client } = fixture()
    expect(() => client.transferUrl("https://evil.test/file")).toThrow(Error)
    expect(client.transferUrl("/download/1").origin).toBe("https://copacker.test")
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://evil.test" } }))
    await expect(
      new CopackerClient({ baseUrl: "https://copacker.test", token: "secret", fetch: fetcher }).transfer("/file")
    ).rejects.toThrow("transfer failed")
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("manual")
  })
  it("validates input before effects and repeats the same mutation key after a transport failure", async () => {
    const { client, requests } = fixture("inventory.update", true, (_, attempt) => {
      if (attempt === 0) {
        throw new TypeError("lost response containing private-secret")
      }
      return Response.json(envelope({ ok: true }))
    })
    await expect(client.call("inventory.update", { extra: true }, { idempotencyKey: "stable" })).rejects.toMatchObject({
      status: 400
    })
    expect(requests).toHaveLength(1)
    await expect(client.call("inventory.update", {})).rejects.toThrow("execution key")
    await expect(client.call("inventory.update", {}, { idempotencyKey: "stable" })).resolves.toHaveProperty(
      "data.ok",
      true
    )
    const writes = requests.slice(1)
    expect(writes).toHaveLength(2)
    expect(writes.map((r) => new Headers(r.headers).get("Idempotency-Key"))).toEqual(["stable", "stable"])
    expect(writes[0]?.body).toBe(writes[1]?.body)
  })
  it("never retries business partial writes or leaks raw transport exceptions", async () => {
    const error = clientError("partial_write", "One target failed.", 409, { result: { confirmed: 1 } })
    const { client, requests } = fixture("product.price.update", true, () =>
      Response.json(error.envelope, { status: 409 })
    )
    await expect(client.call("product.price.update", {}, { idempotencyKey: "price" })).rejects.toMatchObject({
      envelope: { error: { details: { result: { confirmed: 1 } } } }
    })
    expect(requests).toHaveLength(2)
    const failing = fixture("order.list", false, () => {
      throw new Error("private-secret")
    })
    await expect(failing.client.call("order.list", {})).rejects.not.toThrow("private-secret")
  })
  it("checks result-schema compatibility and per-operation byte limits before a mutation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope({ ok: true })))
    const client = new CopackerClient({
      baseUrl: "https://copacker.test",
      token: "secret",
      workspaceId: workspace,
      fetch: fetcher
    })
    const descriptor = definition("product.update", true)
    await expect(
      client.call(
        "product.update",
        {},
        {
          descriptor: { ...descriptor, outputSchema: { $ref: "#/$defs/missing" } },
          idempotencyKey: "unchanged"
        }
      )
    ).rejects.toMatchObject({ envelope: { error: { code: "unsupported_contract" } } })
    await expect(
      client.call(
        "product.update",
        { mode: "éé" },
        {
          descriptor: { ...descriptor, limits: { maxInputBytes: 14 } },
          idempotencyKey: "unchanged"
        }
      )
    ).rejects.toMatchObject({ envelope: { error: { code: "invalid_input" } } })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("classifies execution using the validated input, including defaults", async () => {
    const descriptor = definition("product.update", true)
    descriptor.inputSchema = jsonObject.parse(
      z.toJSONSchema(z.strictObject({ mode: z.literal("read").default("read") }), {
        io: "input"
      })
    )
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope({ ok: true })))
    const client = new CopackerClient({
      baseUrl: "https://copacker.test",
      token: "secret",
      workspaceId: workspace,
      fetch: fetcher
    })
    await expect(client.call("product.update", {}, { descriptor })).resolves.toHaveProperty("data.ok", true)
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).input).toEqual({ mode: "read" })
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has("Idempotency-Key")).toBe(false)
  })
  it("bootstraps schema inspection without recursive discovery or an implicit workspace", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...envelope(accountShow.descriptor),
        meta: { ...envelope({}).meta, workspaceId: null }
      })
    )
    const client = new CopackerClient({ baseUrl: "https://copacker.test", token: "secret", fetch: fetcher })
    await expect(client.call("schema.show", { operation: "account.show" })).resolves.toHaveProperty(
      "data.operation",
      "account.show"
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ input: { operation: "account.show" } })
    await expect(client.call("schema.show", { operation: "po.create" })).rejects.toMatchObject({ status: 400 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("aggregates pages and coverage while rejecting repeated cursors and snapshot changes", async () => {
    const { client } = fixture("order.list", false, (input) =>
      Response.json(
        envelope(
          {
            items: [input.cursor ? 2 : 1],
            page: {
              nextCursor: input.cursor ? null : "next",
              hasMore: !input.cursor,
              consistency: "snapshot",
              snapshotId: workspace
            }
          },
          input.cursor ? "complete" : "partial"
        )
      )
    )
    const result = await client.all("order.list", {})
    expect(result.data).toMatchObject({ items: [1, 2], page: { hasMore: false } })
    expect(result.meta.completeness).toBe("partial")
    const repeated = fixture("order.list", false, () =>
      Response.json(envelope({ items: [], page: { nextCursor: "same", hasMore: true, consistency: "live" } }))
    )
    await expect(repeated.client.all("order.list", {})).rejects.toThrow("repeated")
    const changed = fixture("order.list", false, (input) =>
      Response.json(
        envelope({
          items: [],
          page: {
            nextCursor: input.cursor ? null : "next",
            hasMore: !input.cursor,
            consistency: input.cursor ? "live" : "snapshot",
            snapshotId: workspace
          }
        })
      )
    )
    await expect(changed.client.all("order.list", {})).rejects.toThrow("snapshot changed")
  })
  it("rejects incompatible contracts and workspace confusion before mutations", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json(envelope({ ...definition("po.create", true), contractVersion: "other" }))
    const client = new CopackerClient({
      baseUrl: "https://copacker.test",
      token: "secret",
      workspaceId: workspace,
      fetch: fetcher
    })
    await expect(client.call("po.create", {}, { idempotencyKey: "one" })).rejects.toThrow("versions differ")
    const wrong = new CopackerClient({
      baseUrl: "https://copacker.test",
      token: "secret",
      workspaceId: workspace,
      fetch: async () => Response.json({ ...envelope({}), meta: { ...envelope({}).meta, workspaceId: null } })
    })
    await expect(wrong.call("po.create", {})).rejects.toThrow("different workspace")
    expect(contractVersion).toBeTruthy()
  })
  it("polls only declared read selectors and preserves terminal partial outcomes", async () => {
    const operation = {
      id: workspace,
      name: "shipment.submit",
      status: "running",
      stage: "creating",
      startedAt: null,
      completedAt: null,
      error: null,
      recovery: null
    }
    const initial = envelope({ operation, statusQuery: { operation: "shipment.show", input: {} } })
    const { client } = fixture("shipment.show", false, () =>
      Response.json(
        envelope({
          operation: { ...operation, status: "succeeded" },
          statusQuery: { operation: "shipment.show", input: {} }
        })
      )
    )
    await expect(client.wait(initial, 1000)).resolves.toMatchObject({ data: { operation: { status: "succeeded" } } })
    const mutating = fixture("shipment.show", true)
    await expect(mutating.client.wait(initial, 1000)).rejects.toThrow("not a read")
    await expect(
      client.wait(
        envelope({
          operation: { ...operation, status: "partially_succeeded" },
          statusQuery: { operation: "shipment.show", input: {} }
        }),
        1000
      )
    ).rejects.toMatchObject({ envelope: { error: { code: "partial_write" } } })
  })
  it("honors aborts during backoff", async () => {
    const controller = new AbortController()
    const pending = delay(10000, controller.signal)
    controller.abort(new Error("cancelled"))
    await expect(pending).rejects.toThrow("cancelled")
    await expect(delay(10, controller.signal)).rejects.toThrow("cancelled")
  })
})
