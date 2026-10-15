import { AsyncLocalStorage } from "node:async_hooks"
import type { AuthenticationResponse } from "@workos-inc/node"
import type { AuthResult, AuthService as SessionService, Session } from "@workos/authkit-session"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { cookies, readCookie } = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  readCookie: vi.fn<(name: string) => string | undefined>()
}))
const requestCookies = new AsyncLocalStorage<Map<string, string>>()
vi.mock("server-only", () => ({}))
vi.mock("@tanstack/react-start/server", () => ({ getCookie: readCookie }))
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string, value: string) => cookies.set(name, value) }),
  headers: async () => new Headers()
}))

const signedIn: AuthenticationResponse = {
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
const verified: AuthResult = { ...signedIn, sessionId: "session_test", claims: { sid: "session_test" } }
const cookiePassword = "a-test-only-password-longer-than-thirty-two-characters"
const origin = "https://copacker.example"

beforeEach(() => {
  vi.resetModules()
  cookies.clear()
  readCookie.mockImplementation((name: string) => requestCookies.getStore()?.get(name))
  vi.stubEnv("WORKOS_API_KEY", "sk_test_not_real")
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test")
  vi.stubEnv("WORKOS_COOKIE_PASSWORD", cookiePassword)
  vi.stubEnv("WORKOS_COOKIE_NAME", "migration-session")
  vi.stubEnv("WORKOS_REDIRECT_URI", `${origin}/callback`)
  vi.stubEnv("NEXT_PUBLIC_WORKOS_REDIRECT_URI", `${origin}/callback`)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function unseal(cookie: string) {
  const { sessionEncryption } = await import("@workos/authkit-session")
  const value = decodeURIComponent(cookie.split(";")[0]!.slice("migration-session=".length))
  return sessionEncryption.unsealData<Session>(value, { password: cookiePassword })
}

async function respond(handle: () => Promise<Response>, incoming = new Map<string, string>()) {
  const { withAuthentication } = await import("../src/server/auth-session")
  return requestCookies.run(incoming, () => withAuthentication(new Request(origin), handle))
}

describe("AuthKit session migration", () => {
  it("reads an actual Next AuthKit cookie with the public WorkOS session library", async () => {
    const { saveSession } = await import("@workos-inc/authkit-nextjs")
    await saveSession(signedIn, origin)
    expect(await unseal(`migration-session=${cookies.get("migration-session")}`)).toEqual(signedIn)
  })

  it("stores only session fields and preserves other response cookies and redirects", async () => {
    const { saveAuthentication } = await import("../src/server/auth-session")
    const response = await respond(async () => {
      await saveAuthentication({ ...signedIn, organizationId: "org_test", sealedSession: "unused" })
      return new Response(null, {
        status: 303,
        headers: { Location: "/overview", "Set-Cookie": "workspace=second; Path=/; HttpOnly" }
      })
    })
    const [workspace, cookie] = response.headers.getSetCookie()
    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/overview")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(workspace).toBe("workspace=second; Path=/; HttpOnly")
    expect(cookie).toMatch(/^migration-session=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).not.toMatch(/Domain=/i)
    expect(await unseal(cookie!)).toEqual(signedIn)
  })

  it("validates once per request and writes a refreshed cookie", async () => {
    const { AuthService } = await import("@workos/authkit-session")
    const validate = vi.spyOn(AuthService.prototype, "withAuth").mockResolvedValue({
      auth: verified,
      refreshedSessionData: "refreshed"
    })
    const { authentication } = await import("../src/server/auth-session")
    const response = await respond(async () => {
      const results = await Promise.all([authentication(), authentication()])
      expect(results).toEqual([verified, verified])
      return Response.json({ ok: true })
    })
    expect(validate).toHaveBeenCalledTimes(1)
    expect(response.headers.getSetCookie()).toHaveLength(1)
    expect(response.headers.getSetCookie()[0]).toMatch(/^migration-session=refreshed;/)
  })

  it("does not restore a refreshed session after logout", async () => {
    const { AuthService } = await import("@workos/authkit-session")
    vi.spyOn(AuthService.prototype, "withAuth").mockResolvedValue({ auth: verified, refreshedSessionData: "refreshed" })
    const { signOut } = await import("../src/server/auth-session")
    const response = await respond(async () => {
      const url = new URL(await signOut(origin))
      expect(url.hostname).toBe("api.workos.com")
      expect(url.searchParams.get("session_id")).toBe("session_test")
      expect(url.searchParams.get("return_to")).toBe(origin)
      return new Response(null, { status: 303, headers: { Location: url.href } })
    })
    expect(response.headers.getSetCookie()).toHaveLength(1)
    expect(response.headers.getSetCookie()[0]).toMatch(/^migration-session=;.*Max-Age=0/)
  })

  it.each(["login", "logout"])("gives %s precedence even if refresh finishes later", async (action) => {
    const { AuthService } = await import("@workos/authkit-session")
    const refresh = Promise.withResolvers<{ auth: AuthResult; refreshedSessionData: string }>()
    vi.spyOn(AuthService.prototype, "withAuth").mockReturnValue(refresh.promise)
    const { authentication, saveAuthentication, clearAuthentication } = await import("../src/server/auth-session")
    const response = await respond(async () => {
      const pending = authentication()
      if (action === "login") {
        await saveAuthentication(signedIn)
      } else {
        await clearAuthentication()
      }
      refresh.resolve({ auth: verified, refreshedSessionData: "old-refreshed-session" })
      await pending
      return new Response()
    })
    const emitted = response.headers.getSetCookie()
    expect(emitted).toHaveLength(1)
    const restored = action === "login" ? await unseal(emitted[0]!) : null
    expect(restored).toEqual(action === "login" ? signedIn : null)
    expect(/^migration-session=;.*Max-Age=0/.test(emitted[0]!)).toBe(action === "logout")
  })

  it("rejects a tampered cookie and clears it without making an authentication API call", async () => {
    const network = vi.spyOn(globalThis, "fetch")
    const { authentication } = await import("../src/server/auth-session")
    const response = await respond(
      async () => {
        expect(await authentication()).toEqual({ user: null })
        return new Response()
      },
      new Map([["migration-session", "tampered-cookie"]])
    )
    expect(network).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()[0]).toMatch(/^migration-session=;.*Max-Age=0/)
  })

  it("isolates overlapping authentication services and response cookies", async () => {
    const { AuthService } = await import("@workos/authkit-session")
    const services = new Set<SessionService<Request, Response>>()
    const release = Promise.withResolvers<void>()
    vi.spyOn(AuthService.prototype, "withAuth").mockImplementation(
      async function (this: SessionService<Request, Response>, request) {
        services.add(this)
        const marker = readCookie("marker")
        if (services.size === 2) {
          release.resolve()
        }
        await release.promise
        expect(readCookie("marker")).toBe(marker)
        expect(request.url).toBe(`${origin}/`)
        return { auth: { user: null }, refreshedSessionData: marker }
      }
    )
    const { authentication } = await import("../src/server/auth-session")
    const run = (marker: string) =>
      respond(
        async () => {
          await authentication()
          return new Response()
        },
        new Map([["marker", marker]])
      )
    const responses = await Promise.all([run("first"), run("second")])
    expect(services.size).toBe(2)
    expect(responses[0]!.headers.getSetCookie()[0]).toMatch(/^migration-session=first;/)
    expect(responses[1]!.headers.getSetCookie()[0]).toMatch(/^migration-session=second;/)
    expect(() => authentication()).toThrow("Authentication requires a request context")
  })
})
