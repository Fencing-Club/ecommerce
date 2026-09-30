import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import { type ArtifactStore, type Env, handle } from "../src/index"

const token = "test-token"

// An R2 bucket in memory.
function memoryStore(): ArtifactStore & {
  objects: Map<string, { bytes: Uint8Array<ArrayBuffer>; meta: Record<string, string> }>
} {
  const objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; meta: Record<string, string> }>()
  return {
    objects,
    async get(key) {
      const object = objects.get(key)
      return object
        ? { body: new Response(object.bytes).body!, size: object.bytes.length, customMetadata: object.meta }
        : null
    },
    async head(key) {
      const object = objects.get(key)
      return object ? { size: object.bytes.length, customMetadata: object.meta } : null
    },
    async put(key, value, options) {
      const bytes = new Uint8Array(await new Response(value).arrayBuffer())
      objects.set(key, { bytes, meta: options?.customMetadata ?? {} })
    }
  }
}

let env: Env & { ARTIFACTS: ReturnType<typeof memoryStore> }

const call = (path: string, init: RequestInit & { auth?: string | null } = {}) => {
  const headers = new Headers(init.headers)
  if (init.auth !== null) {
    headers.set("authorization", `Bearer ${init.auth ?? token}`)
  }
  return handle(new Request(`https://cache.example${path}`, { ...init, headers }), env)
}

beforeEach(() => {
  env = { ARTIFACTS: memoryStore(), TOKEN_SHA256: createHash("sha256").update(token).digest("hex") }
})

describe("turbo remote cache", () => {
  it("refuses a missing or wrong token", async () => {
    expect((await call("/v8/artifacts/status", { auth: null })).status).toBe(401)
    expect((await call("/v8/artifacts/status", { auth: "wrong" })).status).toBe(401)
    expect(await (await call("/v8/artifacts/status")).json()).toEqual({ status: "enabled" })
  })

  it("stores an artifact and returns it with its tag and duration", async () => {
    const put = await call("/v8/artifacts/abc123?slug=ecommerce", {
      method: "PUT",
      body: "artifact bytes",
      headers: { "x-artifact-tag": "signature", "x-artifact-duration": "420" }
    })
    expect(put.status).toBe(202)

    const head = await call("/v8/artifacts/abc123?slug=ecommerce", { method: "HEAD" })
    expect(head.status).toBe(200)
    expect(head.headers.get("x-artifact-tag")).toBe("signature")

    const get = await call("/v8/artifacts/abc123?slug=ecommerce")
    expect(await get.text()).toBe("artifact bytes")
    expect(get.headers.get("x-artifact-duration")).toBe("420")
    expect(get.headers.get("content-type")).toBe("application/octet-stream")
  })

  it("keeps each team's artifacts apart", async () => {
    await call("/v8/artifacts/abc123?teamId=one", { method: "PUT", body: "one" })
    expect((await call("/v8/artifacts/abc123?teamId=two")).status).toBe(404)
    expect((await call("/v8/artifacts/abc123?teamId=two", { method: "HEAD" })).status).toBe(404)
  })

  it("says which hashes are cached", async () => {
    await call("/v8/artifacts/aaa", { method: "PUT", body: "x", headers: { "x-artifact-duration": "7" } })
    const response = await call("/v8/artifacts", { method: "POST", body: JSON.stringify({ hashes: ["aaa", "bbb"] }) })
    expect(await response.json()).toEqual({ aaa: { size: 1, taskDurationMs: 7 }, bbb: null })
  })

  it("accepts usage events and rejects other paths and methods", async () => {
    expect((await call("/v8/artifacts/events", { method: "POST", body: "[]" })).status).toBe(200)
    expect((await call("/v8/artifacts/not-a-hash!")).status).toBe(404)
    expect((await call("/v8/artifacts/abc", { method: "DELETE" })).status).toBe(405)
  })
})
