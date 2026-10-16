import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import type { InferEnv, UnwrapConfig } from "cf/config"
import { Miniflare } from "miniflare"
import { afterAll, beforeAll, expect, it } from "vitest"
import type config from "../preview-assets/cloudflare.config"

const runtime = new Miniflare({
  telemetry: { enabled: false },
  workers: [
    {
      config: {
        name: "preview-assets-test",
        compatibilityDate: "2026-10-16",
        manifest: {
          mainModule: "index.js",
          modules: {
            "index.js": {
              type: "esm",
              contents: stripTypeScriptTypes(
                readFileSync(new URL("../preview-assets/index.ts", import.meta.url), "utf8")
              )
            }
          }
        },
        env: { DOCUMENTS: { type: "r2", name: "preview-assets-test" } }
      }
    }
  ]
})
const prefix = "previews/pr-42/storybook/"
const version = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const commit = "a".repeat(40)
const origin = "https://previews.example.com"

beforeAll(async () => {
  const { DOCUMENTS: bucket } =
    await runtime.getBindings<InferEnv<UnwrapConfig<UnwrapConfig<typeof config>["worker"]>>>()
  await bucket.put(`${prefix}.release.json`, JSON.stringify({ commit, version }))
  await bucket.put(`${prefix}${version}/index.html`, "<h1>Storybook</h1>", {
    httpMetadata: { contentType: "text/html; charset=utf-8" }
  })
  await bucket.put("previews/pr-42/app/private.pdf", "private")
  await bucket.put("invoice.pdf", "private staging")
})
afterAll(() => runtime.dispose())

it("serves nested Storybook with metadata, redirects, HEAD and conditional requests", async () => {
  const redirect = await runtime.dispatchFetch(`${origin}/pr-42/storybook?x=1`, { redirect: "manual" })
  expect(redirect.status).toBe(308)
  expect(redirect.headers.get("location")).toBe(`${origin}/pr-42/storybook/?x=1`)
  const response = await runtime.dispatchFetch(`${origin}/pr-42/storybook/`)
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/html")
  expect(response.headers.get("cache-control")).toBe("no-cache")
  expect(await response.text()).toBe("<h1>Storybook</h1>")
  const head = await runtime.dispatchFetch(`${origin}/pr-42/storybook/`, { method: "HEAD" })
  expect(head.status).toBe(200)
  expect(await head.text()).toBe("")
  const conditional = await runtime.dispatchFetch(`${origin}/pr-42/storybook/`, {
    headers: { "If-None-Match": response.headers.get("etag")! }
  })
  expect(conditional.status).toBe(304)
  const health = await runtime.dispatchFetch(`${origin}/pr-42/storybook/health.json`)
  expect(await health.json()).toEqual({ commit })
})

it.each([
  "/invoice.pdf",
  "/pr-42/app/private.pdf",
  "/pr-42/storybook/.release.json",
  "/pr-42/storybook/%252e%252e/app/private.pdf",
  "/pr-42/storybook/%5cprivate.pdf",
  "/pr-43/storybook/"
])("does not expose private files or unpublished previews at %s", async (pathname) => {
  const response = await runtime.dispatchFetch(`${origin}${pathname}`)
  expect(response.status).toBe(404)
})

it("rejects mutations and malformed paths", async () => {
  expect((await runtime.dispatchFetch(`${origin}/pr-42/storybook/`, { method: "POST" })).status).toBe(405)
  expect((await runtime.dispatchFetch(`${origin}/pr-42/storybook/%ZZ`)).status).toBe(400)
})

it("switches releases without stale cache and stops serving cached files after unpublication", async () => {
  const { DOCUMENTS: bucket } =
    await runtime.getBindings<InferEnv<UnwrapConfig<UnwrapConfig<typeof config>["worker"]>>>()
  const next = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
  await bucket.put(`${prefix}${next}/index.html`, "new release")
  await bucket.put(`${prefix}.release.json`, JSON.stringify({ commit: "b".repeat(40), version: next }))
  expect(await (await runtime.dispatchFetch(`${origin}/pr-42/storybook/`)).text()).toBe("new release")
  await bucket.delete(`${prefix}.release.json`)
  expect((await runtime.dispatchFetch(`${origin}/pr-42/storybook/`)).status).toBe(404)
  expect(await (await bucket.get("previews/pr-42/app/private.pdf"))?.text()).toBe("private")
})
