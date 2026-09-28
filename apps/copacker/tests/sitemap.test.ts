import { access } from "node:fs/promises"
import { afterEach, describe, expect, it, vi } from "vitest"
import sitemap from "../src/app/sitemap"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("sitemap.xml", () => {
  it("lists the marketing pages at the deployed address", () => {
    vi.stubEnv("APP_URL", "https://copacker.ai/")
    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://copacker.ai/",
      "https://copacker.ai/contact",
      "https://copacker.ai/privacy",
      "https://copacker.ai/terms"
    ])
  })

  it("lists only pages that exist", async () => {
    vi.stubEnv("APP_URL", "https://copacker.ai")
    for (const { url } of sitemap()) {
      const path = new URL(url).pathname
      await expect(
        access(new URL(`../src/app${path}${path === "/" ? "" : "/"}page.tsx`, import.meta.url))
      ).resolves.toBe(undefined)
    }
  })
})
