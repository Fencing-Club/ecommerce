import type { AuthenticationResponse } from "@workos-inc/node"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cookies = vi.hoisted(() => new Map<string, string>())
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string, value: string) => cookies.set(name, value) }),
  headers: async () => new Headers()
}))

const authentication: AuthenticationResponse = {
  accessToken: "test-access",
  refreshToken: "test-refresh",
  user: {
    object: "user",
    id: "user_test",
    email: "test@example.invalid",
    emailVerified: true,
    name: "Test User",
    firstName: "Test",
    lastName: "User",
    profilePictureUrl: null,
    lastSignInAt: null,
    locale: "en",
    externalId: null,
    metadata: {},
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-15T00:00:00Z"
  }
}

beforeEach(() => {
  vi.resetModules()
  cookies.clear()
  vi.stubEnv("WORKOS_API_KEY", "sk_test_not_real")
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test")
  vi.stubEnv("WORKOS_COOKIE_PASSWORD", "a-test-only-password-longer-than-thirty-two-characters")
  vi.stubEnv("WORKOS_COOKIE_NAME", "migration-session")
  vi.stubEnv("WORKOS_REDIRECT_URI", "https://copacker.example/callback")
  vi.stubEnv("NEXT_PUBLIC_WORKOS_REDIRECT_URI", "https://copacker.example/callback")
})
afterEach(() => vi.unstubAllEnvs())

describe("AuthKit session migration", () => {
  it("reads an actual Next AuthKit cookie with the new SDK", async () => {
    const { saveSession } = await import("@workos-inc/authkit-nextjs")
    await saveSession(authentication, "https://copacker.example")
    const { getAuthkit } = await import("@workos/authkit-tanstack-react-start")
    const session = await (
      await getAuthkit()
    ).getSession(
      new Request("https://copacker.example", {
        headers: { Cookie: `migration-session=${cookies.get("migration-session")}` }
      })
    )
    expect(session).toEqual(authentication)
  })

  it("stores only the session fields, with secure host-only cookies", async () => {
    const { saveAuthentication } = await import("../src/server/auth-session")
    const { response } = await saveAuthentication({
      ...authentication,
      organizationId: "org_test",
      sealedSession: "unused"
    })
    const cookie = response?.headers.getSetCookie()[0]
    expect(cookie).toMatch(/^migration-session=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).not.toMatch(/Domain=/i)
    const { getAuthkit } = await import("@workos/authkit-tanstack-react-start")
    const session = await (
      await getAuthkit()
    ).getSession(
      new Request("https://copacker.example", {
        headers: { Cookie: cookie?.split(";")[0] ?? "" }
      })
    )
    expect(session).toEqual(authentication)
  })
})
