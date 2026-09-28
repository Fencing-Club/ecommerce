import { randomBytes } from "node:crypto"
import {
  AuthenticationException,
  BadRequestException,
  GenericServerException,
  NotFoundException
} from "@workos-inc/node"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The browser's cookies, as next/headers hands them to the server.
const jar = vi.hoisted(() => new Map<string, string>())
// The host the request came in on, when a test sets one.
const request = vi.hoisted(() => ({ host: "" }))
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name)
  }),
  headers: async () =>
    new Headers({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": "vitest",
      ...(request.host && { host: request.host })
    })
}))
const saveSession = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())
vi.mock("@workos-inc/authkit-nextjs", () => ({ saveSession, withAuth: vi.fn<() => void>() }))
const client = vi.hoisted(() => ({
  authenticateWithPassword: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  authenticateWithEmailVerification: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  authenticateWithOrganizationSelection: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  authenticateWithCode: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  createUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  createPasswordReset: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  resetPassword: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getAuthorizationUrlWithPKCE: vi.fn<(...args: unknown[]) => Promise<unknown>>()
}))
vi.mock("../src/server/workos", () => ({
  workos: () => ({ userManagement: client }),
  workosClientId: () => "client_test"
}))
const sendEmail = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())
vi.mock("../src/server/email", () => ({ sendEmail }))
// The workspaces WorkOS organizations belong to, for picking the one a session is for.
const workspaces = vi.hoisted(() => ({ rows: [] as Array<{ workosId: string | null }> }))
vi.mock("@/db", () => ({
  db: () => ({ select: () => ({ from: () => ({ where: async () => workspaces.rows }) }) })
}))

import {
  authorizationUrl,
  finishOAuth,
  pendingVerification,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
  verifyEmail
} from "../src/server/sign-in"

const session = { accessToken: "access", refreshToken: "refresh", user: { id: "user_1", email: "ann@example.net" } }
const verification = () =>
  new AuthenticationException(
    403,
    {
      code: "email_verification_required",
      message: "Email ownership must be verified before authentication.",
      pending_authentication_token: "pending-token",
      email: "ann@example.net",
      email_verification_id: "email_verification_1"
    },
    "request"
  )

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"))
  vi.stubEnv("APP_URL", "https://copacker.example")
  vi.stubEnv("NEXT_PUBLIC_WORKOS_REDIRECT_URI", "https://copacker.example/callback")
  jar.clear()
  request.host = ""
  workspaces.rows = []
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe("signing in with a password", () => {
  it("saves the session and goes to the page sign-in was for", async () => {
    client.authenticateWithPassword.mockResolvedValue(session)
    await expect(signIn({ email: "ann@example.net", password: "secret", next: "/orders?tab=open" })).resolves.toEqual({
      redirect: "/orders?tab=open"
    })
    expect(client.authenticateWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client_test",
        email: "ann@example.net",
        password: "secret",
        ipAddress: "203.0.113.9",
        userAgent: "vitest"
      })
    )
    expect(saveSession).toHaveBeenCalledWith(session, "https://copacker.example")
  })

  it("never returns to another site or to sign-in itself", async () => {
    client.authenticateWithPassword.mockResolvedValue(session)
    for (const next of ["https://evil.example", "//evil.example", "/signup", undefined]) {
      await expect(signIn({ email: "ann@example.net", password: "secret", next })).resolves.toEqual({ redirect: "/" })
    }
  })

  it("says the email or password is wrong", async () => {
    client.authenticateWithPassword.mockRejectedValue(
      new GenericServerException(400, "Invalid credentials", { code: "invalid_credentials" }, "request")
    )
    await expect(signIn({ email: "ann@example.net", password: "wrong" })).rejects.toThrow(
      "Incorrect email or password."
    )
    expect(saveSession).not.toHaveBeenCalled()
  })

  it("asks for the emailed code, then signs in with it", async () => {
    client.authenticateWithPassword.mockRejectedValue(verification())
    await expect(signIn({ email: "ann@example.net", password: "secret", next: "/orders" })).resolves.toEqual({
      redirect: "/verify-email"
    })
    expect(saveSession).not.toHaveBeenCalled()
    // The pending sign-in is sealed in a cookie, not handed to the page.
    expect([...jar.values()].join()).not.toContain("pending-token")
    expect(await pendingVerification()).toMatchObject({ email: "ann@example.net", next: "/orders" })

    client.authenticateWithEmailVerification.mockResolvedValue(session)
    await expect(verifyEmail({ code: "123456" })).resolves.toEqual({ redirect: "/orders" })
    expect(client.authenticateWithEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456", pendingAuthenticationToken: "pending-token" })
    )
    expect(saveSession).toHaveBeenCalledOnce()
    expect(await pendingVerification()).toBeNull()
  })

  it("keeps the sign-in waiting after a wrong code", async () => {
    client.authenticateWithPassword.mockRejectedValue(verification())
    await signIn({ email: "ann@example.net", password: "secret" })
    client.authenticateWithEmailVerification.mockRejectedValue(
      new GenericServerException(400, "Invalid one-time code", { code: "invalid_one_time_code" }, "request")
    )
    await expect(verifyEmail({ code: "000000" })).rejects.toThrow("That code isn’t right")
    expect(await pendingVerification()).not.toBeNull()
    await expect(verifyEmail({ code: "12345" })).rejects.toThrow("Enter the 6-digit code")
  })

  it("asks to sign in again once the code has gone", async () => {
    await expect(verifyEmail({ code: "123456" })).rejects.toThrow("This code expired")
    expect(client.authenticateWithEmailVerification).not.toHaveBeenCalled()
  })

  it("opens the session for the workspace this browser had open", async () => {
    const selection = new AuthenticationException(
      400,
      {
        code: "organization_selection_required",
        message: "Choose an organization",
        pending_authentication_token: "pending-token",
        organizations: [
          { id: "org_a", name: "Buyer" },
          { id: "org_b", name: "Supplier" }
        ]
      },
      "request"
    )
    client.authenticateWithPassword.mockRejectedValue(selection)
    client.authenticateWithOrganizationSelection.mockResolvedValue(session)
    jar.set("copacker-workspace", "6f1c7c3e-4a0b-4c47-9a0d-2d3f4a5b6c7d")
    workspaces.rows = [{ workosId: "org_b" }]
    await expect(signIn({ email: "ann@example.net", password: "secret" })).resolves.toEqual({ redirect: "/" })
    expect(client.authenticateWithOrganizationSelection).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_b", pendingAuthenticationToken: "pending-token" })
    )

    // Without an open workspace, the first organization.
    jar.clear()
    await signIn({ email: "ann@example.net", password: "secret" })
    expect(client.authenticateWithOrganizationSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({ organizationId: "org_a" })
    )
  })

  it("sends someone whose company requires single sign-on to it", async () => {
    client.authenticateWithPassword.mockRejectedValue(
      new AuthenticationException(
        400,
        { error: "sso_required", error_description: "Use SSO", connection_ids: ["conn_1"] },
        "request"
      )
    )
    client.getAuthorizationUrlWithPKCE.mockResolvedValue({
      url: "https://sso.example/authorize",
      state: "state",
      codeVerifier: "verifier"
    })
    await expect(signIn({ email: "ann@example.net", password: "secret" })).resolves.toEqual({
      redirect: "https://sso.example/authorize"
    })
    expect(client.getAuthorizationUrlWithPKCE).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn_1", redirectUri: "https://copacker.example/callback" })
    )
  })
})

describe("creating an account", () => {
  it("creates the user, then asks for the emailed code", async () => {
    client.createUser.mockResolvedValue({ id: "user_1" })
    client.authenticateWithPassword.mockRejectedValue(verification())
    await expect(signUp({ email: "ann@example.net", password: "a long passphrase" })).resolves.toEqual({
      redirect: "/verify-email"
    })
    expect(client.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ann@example.net", password: "a long passphrase", ipAddress: "203.0.113.9" })
    )
  })

  it("explains the password rules WorkOS applies", async () => {
    client.createUser.mockRejectedValue(
      new BadRequestException({
        code: "password_strength_error",
        message: "Password does not meet strength requirements",
        errors: [{ code: "password_too_weak", message: "Weak", warning: "This is a heavily used password." }],
        requestID: "request"
      })
    )
    await expect(signUp({ email: "ann@example.net", password: "password1234" })).rejects.toThrow(
      "This is a heavily used password. Choose a stronger password."
    )
  })

  it("points an email that already has an account to sign-in", async () => {
    client.createUser.mockRejectedValue(
      new BadRequestException({
        code: "user_creation_error",
        errors: [{ code: "email_not_available", message: "This email is not available." }],
        requestID: "request"
      })
    )
    await expect(signUp({ email: "ann@example.net", password: "a long passphrase" })).rejects.toThrow(
      "already has an account"
    )
  })

  it("checks the password's length before asking WorkOS", async () => {
    await expect(signUp({ email: "ann@example.net", password: "short" })).rejects.toThrow("Use at least 10 characters")
    expect(client.createUser).not.toHaveBeenCalled()
  })
})

describe("resetting a password", () => {
  const reset = (minutes: number) => ({
    id: "password_reset_1",
    userId: "user_1",
    email: "ann@example.net",
    passwordResetToken: "reset/token+1",
    passwordResetUrl: "https://hosted.example/reset-password?token=reset/token+1",
    expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
    createdAt: new Date().toISOString()
  })

  it("emails a link to Copacker's own reset page, never the hosted one", async () => {
    client.createPasswordReset.mockResolvedValue(reset(15))
    sendEmail.mockResolvedValue()
    await expect(requestPasswordReset({ email: "ann@example.net" })).resolves.toEqual({ ok: true })
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ann@example.net", key: "password-reset:password_reset_1" })
    )
    const [email] = sendEmail.mock.calls[0] as [{ text: string }]
    expect(email.text).toContain("https://copacker.example/reset-password?token=reset%2Ftoken%2B1")
    expect(email.text).toContain("expires in 15 minutes")
    expect(email.text).not.toContain("hosted.example")
  })

  it("says how long a longer link lasts in hours", async () => {
    client.createPasswordReset.mockResolvedValue(reset(60))
    sendEmail.mockResolvedValue()
    await requestPasswordReset({ email: "ann@example.net" })
    const [email] = sendEmail.mock.calls[0] as [{ text: string }]
    expect(email.text).toContain("expires in 1 hour.")
  })

  it("answers the same whether or not the email has an account", async () => {
    client.createPasswordReset.mockRejectedValue(
      new NotFoundException({ code: "entity_not_found", message: "User not found", path: "/", requestID: "request" })
    )
    await expect(requestPasswordReset({ email: "nobody@example.net" })).resolves.toEqual({ ok: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("still answers when its own email can't be sent, since WorkOS sends one too", async () => {
    client.createPasswordReset.mockResolvedValue(reset(15))
    sendEmail.mockRejectedValue(new Error("Email provider rejected delivery (403)"))
    await expect(requestPasswordReset({ email: "ann@example.net" })).resolves.toEqual({ ok: true })
    expect(console.error).toHaveBeenCalledWith("Couldn’t send the password reset email", expect.any(Error))
  })

  it("saves the new password and signs in with it", async () => {
    client.resetPassword.mockResolvedValue({ user: { email: "ann@example.net" } })
    client.authenticateWithPassword.mockResolvedValue(session)
    await expect(resetPassword({ token: "reset-token", password: "a new passphrase" })).resolves.toEqual({
      redirect: "/"
    })
    expect(client.resetPassword).toHaveBeenCalledWith({ token: "reset-token", newPassword: "a new passphrase" })
    expect(client.authenticateWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ann@example.net", password: "a new passphrase" })
    )
  })

  it("says when the link has expired", async () => {
    client.resetPassword.mockRejectedValue(
      new NotFoundException({ code: "password_reset_token_not_found", message: "Not found", path: "/", requestID: "r" })
    )
    await expect(resetPassword({ token: "old", password: "a new passphrase" })).rejects.toThrow("This link expired")
  })
})

describe("Google and Microsoft", () => {
  it("brings back the page sign-in was for, checking the state and PKCE verifier", async () => {
    client.getAuthorizationUrlWithPKCE.mockResolvedValue({
      url: "https://api.workos.example/authorize",
      state: "state-1",
      codeVerifier: "verifier-1"
    })
    await expect(authorizationUrl({ provider: "google" }, "/orders", "ann@example.net")).resolves.toBe(
      "https://api.workos.example/authorize"
    )
    expect(client.getAuthorizationUrlWithPKCE).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "GoogleOAuth", loginHint: "ann@example.net" })
    )
    client.authenticateWithCode.mockResolvedValue(session)
    await expect(finishOAuth(new URLSearchParams({ code: "code-1", state: "state-1" }))).resolves.toBe("/orders")
    expect(client.authenticateWithCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: "code-1", codeVerifier: "verifier-1" })
    )
    expect(saveSession).toHaveBeenCalledWith(session, "https://copacker.example")
  })

  it("comes back to staging when sign-in starts there", async () => {
    vi.stubEnv("APP_ALIAS_URLS", "https://staging.copacker.example")
    request.host = "staging.copacker.example"
    client.getAuthorizationUrlWithPKCE.mockResolvedValue({ url: "u", state: "state-1", codeVerifier: "verifier-1" })
    await authorizationUrl({ provider: "google" }, "/orders")
    expect(client.getAuthorizationUrlWithPKCE).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: "https://staging.copacker.example/callback" })
    )
  })

  it("turns away a state it didn't send, or a return with no sign-in started", async () => {
    client.getAuthorizationUrlWithPKCE.mockResolvedValue({ url: "u", state: "state-1", codeVerifier: "verifier-1" })
    await authorizationUrl({ provider: "microsoft" }, "/")
    await expect(finishOAuth(new URLSearchParams({ code: "code-1", state: "forged" }))).resolves.toBe(
      "/login?error=oauth"
    )
    // The round trip is used up either way.
    await expect(finishOAuth(new URLSearchParams({ code: "code-1", state: "state-1" }))).resolves.toBe(
      "/login?error=oauth"
    )
    expect(client.authenticateWithCode).not.toHaveBeenCalled()
  })
})
