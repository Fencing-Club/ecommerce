import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authSearch } from "../src/lib/auth-pages"
import { loadAuthPage } from "../src/server/auth-pages"
import type { SignInRequest } from "../src/server/sign-in"

const flows = vi.hoisted(() => ({
  invitedEmail: vi.fn<(token: string) => Promise<string | null>>(),
  pendingVerification: vi.fn<() => { email: string } | null>()
}))
vi.mock("../src/server/sign-in", () => flows)

const signIn: SignInRequest = {
  headers: new Headers(),
  ipAddress: undefined,
  cookies: { get: () => undefined, set: () => undefined, delete: () => undefined },
  saveSession: async () => undefined
}
const request = {
  signedIn: vi.fn<() => Promise<boolean>>(async () => false),
  signInRequest: vi.fn<() => SignInRequest>(() => signIn)
}
beforeEach(() => {
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test")
  request.signedIn.mockResolvedValue(false)
  flows.invitedEmail.mockResolvedValue(null)
  flows.pendingVerification.mockReturnValue(null)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("auth page loading", () => {
  it.each(["login", "signup"] as const)(
    "sends %s to setup before reading a session when auth is unconfigured",
    async (kind) => {
      vi.stubEnv("WORKOS_CLIENT_ID", "")
      expect(await loadAuthPage(kind, {}, request)).toEqual({ redirect: "/setup" })
      expect(request.signedIn).not.toHaveBeenCalled()
    }
  )
  it.each(["login", "signup"] as const)("redirects a signed-in %s visitor to a validated return path", async (kind) => {
    request.signedIn.mockResolvedValue(true)
    expect(await loadAuthPage(kind, { next: "/orders?tab=open", invitation_token: "unused" }, request)).toEqual({
      redirect: "/orders?tab=open"
    })
    expect(flows.invitedEmail).not.toHaveBeenCalled()
  })
  it.each(["https://foreign.example", "//foreign.example", "/\\foreign.example", "/login", "/api/action"])(
    "rejects unsafe or looping return path %s",
    async (next) => {
      expect(await loadAuthPage("login", { next, error: "untrusted provider error" }, request)).toEqual({
        page: { kind: "login", next: "/", failed: true }
      })
    }
  )
  it("locks sign-up to the server-resolved invitation email", async () => {
    flows.invitedEmail.mockResolvedValue("invited@example.net")
    expect(
      await loadAuthPage(
        "signup",
        { next: "/orders", email: "spoof@example.net", invitation_token: "invitation" },
        request
      )
    ).toEqual({
      page: { kind: "signup", next: "/orders", email: "invited@example.net", invitation: "invitation" }
    })
  })
  it("falls back to ordinary sign-up for an invalid invitation", async () => {
    expect(await loadAuthPage("signup", { email: "typed@example.net", invitation_token: "expired" }, request)).toEqual({
      page: { kind: "signup", next: "/", email: "typed@example.net" }
    })
  })
  it("returns only the pending email for verification and redirects missing or expired state", async () => {
    expect(await loadAuthPage("verify-email", {}, request)).toEqual({ redirect: "/login" })
    flows.pendingVerification.mockReturnValue({ email: "pending@example.net" })
    expect(await loadAuthPage("verify-email", { token: "forged", email: "spoof@example.net" }, request)).toEqual({
      page: { kind: "verify-email", email: "pending@example.net" }
    })
    expect(request.signedIn).not.toHaveBeenCalled()
  })
  it("keeps recovery pages available without reading or requiring a session", async () => {
    vi.stubEnv("WORKOS_CLIENT_ID", "")
    expect(await loadAuthPage("forgot-password", { email: "typed@example.net" }, request)).toEqual({
      page: { kind: "forgot-password", email: "typed@example.net" }
    })
    expect(await loadAuthPage("reset-password", {}, request)).toEqual({ page: { kind: "reset-password" } })
    expect(await loadAuthPage("reset-password", { token: "reset" }, request)).toEqual({
      page: { kind: "reset-password", token: "reset" }
    })
    expect(request.signedIn).not.toHaveBeenCalled()
    expect(request.signInRequest).not.toHaveBeenCalled()
  })
  it("does not turn malformed search values into form input", () => {
    expect(authSearch.parse({ next: ["/orders"], email: true, token: {}, extra: "unused" })).toEqual({
      next: undefined,
      email: undefined,
      token: undefined
    })
  })
})
