import { readdir } from "node:fs/promises"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import robots from "../src/server/robots"

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://copacker.ai")
})
afterEach(() => {
  vi.unstubAllEnvs()
})

// The one rule robots.txt has, for every crawler, and whether a path falls under one of its closed prefixes.
function rule() {
  const { rules } = robots()
  const [only] = [rules].flat()
  return { only, closed: (path: string) => [only?.disallow ?? []].flat().some((prefix) => path.startsWith(prefix)) }
}

describe("robots.txt", () => {
  it("lets every crawler in and points it to the sitemap at the deployed address", () => {
    const { only } = rule()
    expect(only?.userAgent).toBe("*")
    expect(only?.allow).toBe("/")
    expect(robots().sitemap).toBe("https://copacker.ai/sitemap.xml")
  })

  it("keeps the marketing pages, sign-in, sign-up and the site's assets open", () => {
    const { closed } = rule()
    const open = ["/", "/contact", "/privacy", "/terms", "/login", "/signup", "/marketing/og.jpg", "/assets/entry.js"]
    expect(open.filter(closed)).toEqual([])
  })

  it("closes the API and the links that carry one-time tokens", () => {
    const { closed } = rule()
    const tokens = ["/api/contact", "/invite?token=abc", "/reset-password?token=abc", "/verify-email", "/callback"]
    expect(tokens.filter((path) => !closed(path))).toEqual([])
  })

  it("closes every page of the signed-in app", async () => {
    const { closed } = rule()
    const files = await readdir(new URL("../src/app/(portal)/", import.meta.url), { recursive: true })
    // Each page under the portal's route group, by its first segment, such as /orders for orders/[id]/page.tsx.
    const pages = new Set(
      files.filter((file) => /[\\/]page\.tsx$/.test(file)).map((file) => `/${file.split(/[\\/]/)[0]}`)
    )
    expect(pages.size).toBeGreaterThan(10)
    expect([...pages, "/onboarding", "/workspaces/new"].filter((page) => !closed(page))).toEqual([])
  })
})
