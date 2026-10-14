import { describe, expect, it } from "vitest"
import { developmentUrl, localAppEnvironment, worktreeName } from "../scripts/dev-environment"

describe("worktree origins", () => {
  it("keeps the primary checkout stable", () => {
    expect(developmentUrl(worktreeName("D:\\ecommerce", true), "app")).toBe("https://main.local.copacker.ai")
  })
  it("normalizes Windows paths and disambiguates colliding directory slugs", () => {
    const a = worktreeName("D:\\system\\worktrees\\ecommerce\\Fix_UI", false)
    expect(a).toBe(worktreeName("d:/system/worktrees/ecommerce/fix_ui", false))
    expect(a).not.toBe(worktreeName("D:/system/worktrees/ecommerce/fix-ui", false))
    expect(a).toMatch(/^fix-ui-[a-f0-9]{8}$/)
  })
  it("bounds DNS labels and isolates service hosts", () => {
    const name = worktreeName(`/worktrees/${"a".repeat(100)}`, false)
    expect(name.length).toBeLessThanOrEqual(63)
    expect(new URL(developmentUrl(name, "app")).hostname.split(".")).toHaveLength(4)
    expect(developmentUrl(name, "stories")).toBe(`https://${name}.stories.local.copacker.ai`)
    expect(developmentUrl(name, "e2e")).toBe(`https://${name}.e2e.local.copacker.ai`)
  })
  it("replaces stale aliases, callbacks and shared cookie domains", () => {
    const origin = "https://feature-12345678.local.copacker.ai"
    expect(localAppEnvironment(origin)).toEqual({
      APP_URL: origin,
      APP_ALIAS_URLS: "",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: `${origin}/callback`,
      WORKOS_COOKIE_DOMAIN: "",
      COPACKER_LOCAL: "1"
    })
  })
})
