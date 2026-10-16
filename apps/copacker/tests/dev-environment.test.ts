import { describe, expect, it } from "vitest"
import { developmentUrl, localAppEnvironment, worktreeName } from "../scripts/dev-environment"

describe("worktree origins", () => {
  it("keeps the primary checkout stable", () => {
    const name = worktreeName("D:\\ecommerce", true)
    expect(name).toBeNull()
    expect(developmentUrl(name, "app")).toBe("https://local.copacker.ai")
    expect(developmentUrl(name, "stories")).toBe("https://stories.local.copacker.ai")
    expect(developmentUrl(name, "e2e")).toBe("https://e2e.local.copacker.ai")
  })
  it("uses readable folder names and leaves normalized collisions for route ownership checks", () => {
    const a = worktreeName("D:\\system\\worktrees\\ecommerce\\Fix_UI", false)
    expect(a).toBe(worktreeName("d:/system/worktrees/ecommerce/fix_ui", false))
    expect(a).toBe(worktreeName("D:/system/worktrees/ecommerce/fix-ui", false))
    expect(a).toBe("fix-ui")
  })
  it("bounds DNS labels and isolates service hosts", () => {
    expect(() => worktreeName(`/worktrees/${"a".repeat(100)}`, false)).toThrow("63-character")
    for (const reserved of ["stories", "e2e", "hooks"]) {
      expect(() => worktreeName(`/worktrees/${reserved}`, false)).toThrow("reserved")
    }
    const name = worktreeName("/worktrees/fix-ui", false)
    expect(name).toBe("fix-ui")
    expect(new URL(developmentUrl(name, "app")).hostname.split(".")).toHaveLength(4)
    expect(developmentUrl(name, "stories")).toBe(`https://${name}.stories.local.copacker.ai`)
    expect(developmentUrl(name, "e2e")).toBe(`https://${name}.e2e.local.copacker.ai`)
  })
  it("replaces stale aliases, callbacks and shared cookie domains", () => {
    const origin = "https://feature.local.copacker.ai"
    expect(localAppEnvironment(origin)).toEqual({
      APP_URL: origin,
      APP_ALIAS_URLS: "",
      WORKOS_REDIRECT_URI: `${origin}/callback`,
      WORKOS_COOKIE_DOMAIN: "",
      COPACKER_LOCAL: "1"
    })
  })
})
