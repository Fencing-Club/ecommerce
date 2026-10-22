import { randomBytes } from "node:crypto"
import {
  AuthenticationException,
  BadRequestException,
  GenericServerException,
  NotFoundException
} from "@workos-inc/node"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const jar = new Map<string, string>()
const request = { host: "" }
const saveSession = vi.fn<(...args: unknown[]) => Promise<void>>()
const context: SignInRequest = {
  get headers() {
    return new Headers({ "user-agent": "vitest", ...(request.host && { host: request.host }) })
  },
  ipAddress: "203.0.113.9",
  cookies: {
    get: (name) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name, value) => void jar.set(name, value),
    delete: (name) => void jar.delete(name)
  },
  saveSession
}
const client = vi.hoisted(() => ({
  authenticateWithPassword: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  authenticateWithEmailVerification: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  authenticateWithOrganizationSelection: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  authenticateWithCode: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  createUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  createPasswordReset: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  resetPassword: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getAuthorizationUrlWithPKCE: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  findInvitationByToken: vi.fn<(...args: unknown[]) => Promise<unknown>>()
}))
vi.mock("../src/server/workos", () => ({
  workos: () => ({ userManagement: client }),
  workosClientId: () => "client_test"
}))
const sendEmail = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())
vi.mock("../src/server/email", () => ({ sendEmail }))
// The rows any query finds: the workspaces WorkOS organizations belong to, for picking the one a session is for, or a
// profile's chosen language.
const workspaces = vi.hoisted(() => ({ rows: [] as Array<{ workosId?: string | null; locale?: string | null }> }))
vi.mock("@/db", () => ({
  db: () => ({ select: () => ({ from: () => ({ where: async () => workspaces.rows }) }) })
}))

import {
  authorizationUrl,
  finishOAuth,
  invitedEmail,
  pendingVerification,
  requestPasswordReset,
  resendCode,
  resetPassword,
  signIn,
  signUp,
  type SignInRequest,
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
    await expect(
      signIn(context, { email: "ann@example.net", password: "secret", next: "/orders?tab=open" })
    ).resolves.toEqual({
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
    expect(saveSession).toHaveBeenCalledWith(session)
  })

  it("never returns to another site or to sign-in itself", async () => {
    client.authenticateWithPassword.mockResolvedValue(session)
    for (const next of ["https://evil.example", "//evil.example", "/signup", undefined]) {
      await expect(signIn(context, { email: "ann@example.net", password: "secret", next })).resolves.toEqual({
        redirect: "/"
      })
    }
  })

  it("says the email or password is wrong", async () => {
    client.authenticateWithPassword.mockRejectedValue(
      new GenericServerException(400, "Invalid credentials", { code: "invalid_credentials" }, "request")
    )
    await expect(signIn(context, { email: "ann@example.net", password: "wrong" })).rejects.toThrow(
      "Incorrect email or password."
    )
    expect(saveSession).not.toHaveBeenCalled()
  })

  it("asks for the emailed code, then signs in with it", async () => {
    client.authenticateWithPassword.mockRejectedValue(verification())
    await expect(signIn(context, { email: "ann@example.net", password: "secret", next: "/orders" })).resolves.toEqual({
      redirect: "/verify-email"
    })
    expect(saveSession).not.toHaveBeenCalled()
    // The pending sign-in is sealed in a cookie, not handed to the page.
    expect([...jar.values()].join()).not.toContain("pending-token")
    expect(pendingVerification(context)).toEqual({ email: "ann@example.net" })

    client.authenticateWithEmailVerification.mockResolvedValue(session)
    await expect(verifyEmail(context, { code: "123456" })).resolves.toEqual({ redirect: "/orders" })
    expect(client.authenticateWithEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456", pendingAuthenticationToken: "pending-token" })
    )
    expect(saveSession).toHaveBeenCalledOnce()
    expect(await pendingVerification(context)).toBeNull()
  })

  it("keeps the sign-in waiting after a wrong code", async () => {
    client.authenticateWithPassword.mockRejectedValue(verification())
    await signIn(context, { email: "ann@example.net", password: "secret" })
    client.authenticateWithEmailVerification.mockRejectedValue(
      new GenericServerException(400, "Invalid one-time code", { code: "invalid_one_time_code" }, "request")
    )
    await expect(verifyEmail(context, { code: "000000" })).rejects.toThrow("That code isn’t right")
    expect(await pendingVerification(context)).not.toBeNull()
    await expect(verifyEmail(context, { code: "12345" })).rejects.toThrow("auth.validation.enterCode")
  })

  it("asks to sign in again once the code has gone", async () => {
    await expect(verifyEmail(context, { code: "123456" })).rejects.toThrow("This code expired")
    expect(client.authenticateWithEmailVerification).not.toHaveBeenCalled()
  })

  it("rejects a tampered verification cookie before asking WorkOS", async () => {
    jar.set("copacker-verify", "tampered")
    expect(pendingVerification(context)).toBeNull()
    await expect(verifyEmail(context, { code: "123456" })).rejects.toThrow("This code expired")
    await expect(resendCode(context)).rejects.toThrow("This code expired")
    expect(client.authenticateWithEmailVerification).not.toHaveBeenCalled()
    expect(saveSession).not.toHaveBeenCalled()
  })

  it("keeps overlapping sign-ins' cookies, sessions and client addresses separate", async () => {
    const otherJar = new Map<string, string>()
    const otherSave = vi.fn<(...args: unknown[]) => Promise<void>>()
    const other: SignInRequest = {
      headers: new Headers({ "user-agent": "other-browser" }),
      ipAddress: "203.0.113.10",
      cookies: {
        get: (name) => (otherJar.has(name) ? { value: otherJar.get(name)! } : undefined),
        set: (name, value) => void otherJar.set(name, value),
        delete: (name) => void otherJar.delete(name)
      },
      saveSession: otherSave
    }
    const waiting = Promise.withResolvers<unknown>()
    client.authenticateWithPassword.mockReturnValueOnce(waiting.promise).mockResolvedValueOnce(session)
    const first = signIn(context, { email: "ann@example.net", password: "secret", next: "/orders" })
    expect(await signIn(other, { email: "bob@example.net", password: "secret", next: "/overview" })).toEqual({
      redirect: "/overview"
    })
    waiting.reject(verification())
    expect(await first).toEqual({ redirect: "/verify-email" })
    expect(pendingVerification(context)).toEqual({ email: "ann@example.net" })
    expect(pendingVerification(other)).toBeNull()
    expect(saveSession).not.toHaveBeenCalled()
    expect(otherSave).toHaveBeenCalledWith(session)
    expect(client.authenticateWithPassword).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ipAddress: "203.0.113.10", userAgent: "other-browser" })
    )
  })

  it("keeps pending authentication in a host-only, secure, ten-minute cookie", async () => {
    const set = vi.spyOn(context.cookies, "set")
    client.authenticateWithPassword.mockRejectedValue(verification())
    await signIn(context, { email: "ann@example.net", password: "secret" })
    expect(set).toHaveBeenCalledWith("copacker-verify", expect.any(String), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600
    })
    set.mockRestore()
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
    await expect(signIn(context, { email: "ann@example.net", password: "secret" })).resolves.toEqual({ redirect: "/" })
    expect(client.authenticateWithOrganizationSelection).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_b", pendingAuthenticationToken: "pending-token" })
    )

    // Without an open workspace, the first organization.
    jar.clear()
    await signIn(context, { email: "ann@example.net", password: "secret" })
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
    await expect(signIn(context, { email: "ann@example.net", password: "secret" })).resolves.toEqual({
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
    await expect(signUp(context, { email: "ann@example.net", password: "a long passphrase" })).resolves.toEqual({
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
    await expect(signUp(context, { email: "ann@example.net", password: "password1234" })).rejects.toThrow(
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
    await expect(signUp(context, { email: "ann@example.net", password: "a long passphrase" })).rejects.toThrow(
      "already has an account"
    )
  })

  it("accepts a WorkOS invitation it was opened with, which confirms the address instead of a code", async () => {
    client.createUser.mockResolvedValue({ id: "user_1" })
    client.authenticateWithPassword.mockResolvedValue(session)
    await expect(
      signUp(context, { email: "ann@example.net", password: "a long passphrase", invitation: "invitation_token_1" })
    ).resolves.toEqual({ redirect: "/" })
    expect(client.authenticateWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ann@example.net", invitationToken: "invitation_token_1" })
    )
  })

  it("checks the password's length before asking WorkOS", async () => {
    await expect(signUp(context, { email: "ann@example.net", password: "short" })).rejects.toThrow(
      "auth.validation.passwordTooShort"
    )
    expect(client.createUser).not.toHaveBeenCalled()
  })
})

describe("WorkOS invitations", () => {
  const invitation = (state: string) => ({ id: "invitation_1", email: "ann@example.net", state })

  it("finds the address a pending invitation is for", async () => {
    client.findInvitationByToken.mockResolvedValue(invitation("pending"))
    await expect(invitedEmail("invitation_token_1")).resolves.toBe("ann@example.net")
    expect(client.findInvitationByToken).toHaveBeenCalledWith("invitation_token_1")
  })

  it("ignores an invitation that was used, revoked or has expired, or a token WorkOS doesn't know", async () => {
    for (const state of ["accepted", "revoked", "expired"]) {
      client.findInvitationByToken.mockResolvedValueOnce(invitation(state))
      await expect(invitedEmail("invitation_token_1")).resolves.toBeNull()
    }
    client.findInvitationByToken.mockRejectedValueOnce(new NotFoundException({ path: "", requestID: "request" }))
    await expect(invitedEmail("unknown")).resolves.toBeNull()
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
    await expect(requestPasswordReset(context, { email: "ann@example.net" })).resolves.toEqual({ ok: true })
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
    await requestPasswordReset(context, { email: "ann@example.net" })
    const [email] = sendEmail.mock.calls[0] as [{ text: string }]
    expect(email.text).toContain("expires in 1 hour.")
  })

  it("writes the email in the language the person chose", async () => {
    client.createPasswordReset.mockResolvedValue(reset(15))
    sendEmail.mockResolvedValue()
    workspaces.rows = [{ locale: "de" }]
    await requestPasswordReset(context, { email: "ann@example.net" })
    const [email] = sendEmail.mock.calls[0] as [{ subject: string; text: string }]
    expect(email.subject).toBe("Setzen Sie Ihr Copacker-Passwort zurück")
    expect(email.text).toContain("läuft in 15 Minuten ab")
  })

  it("answers the same whether or not the email has an account", async () => {
    client.createPasswordReset.mockRejectedValue(
      new NotFoundException({ code: "entity_not_found", message: "User not found", path: "/", requestID: "request" })
    )
    await expect(requestPasswordReset(context, { email: "nobody@example.net" })).resolves.toEqual({ ok: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("still answers when its own email can't be sent, since WorkOS sends one too", async () => {
    client.createPasswordReset.mockResolvedValue(reset(15))
    sendEmail.mockRejectedValue(new Error("Email provider rejected delivery (403)"))
    await expect(requestPasswordReset(context, { email: "ann@example.net" })).resolves.toEqual({ ok: true })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"event":"password_reset_email_failed"'))
  })

  it("saves the new password and signs in with it", async () => {
    client.resetPassword.mockResolvedValue({ user: { email: "ann@example.net" } })
    client.authenticateWithPassword.mockResolvedValue(session)
    await expect(resetPassword(context, { token: "reset-token", password: "a new passphrase" })).resolves.toEqual({
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
    await expect(resetPassword(context, { token: "old", password: "a new passphrase" })).rejects.toThrow(
      "This link expired"
    )
  })
})

describe("Google and Microsoft", () => {
  it("brings back the page sign-in was for, checking the state and PKCE verifier", async () => {
    client.getAuthorizationUrlWithPKCE.mockResolvedValue({
      url: "https://api.workos.example/authorize",
      state: "state-1",
      codeVerifier: "verifier-1"
    })
    await expect(authorizationUrl(context, { provider: "google" }, "/orders", "ann@example.net")).resolves.toBe(
      "https://api.workos.example/authorize"
    )
    expect(client.getAuthorizationUrlWithPKCE).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "GoogleOAuth", loginHint: "ann@example.net" })
    )
    client.authenticateWithCode.mockResolvedValue(session)
    await expect(finishOAuth(context, new URLSearchParams({ code: "code-1", state: "state-1" }))).resolves.toBe(
      "/orders"
    )
    expect(client.authenticateWithCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: "code-1", codeVerifier: "verifier-1" })
    )
    expect(saveSession).toHaveBeenCalledWith(session)
  })

  it("comes back to staging when sign-in starts there", async () => {
    vi.stubEnv("APP_ALIAS_URLS", "https://staging.copacker.example")
    request.host = "staging.copacker.example"
    client.getAuthorizationUrlWithPKCE.mockResolvedValue({ url: "u", state: "state-1", codeVerifier: "verifier-1" })
    await authorizationUrl(context, { provider: "google" }, "/orders")
    expect(client.getAuthorizationUrlWithPKCE).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: "https://staging.copacker.example/callback" })
    )
  })

  it("ignores an unregistered request host when constructing the OAuth callback", async () => {
    request.host = "forged.example"
    client.getAuthorizationUrlWithPKCE.mockResolvedValue({ url: "u", state: "state-1", codeVerifier: "verifier-1" })
    await authorizationUrl(context, { provider: "google" }, "/orders")
    expect(client.getAuthorizationUrlWithPKCE).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: "https://copacker.example/callback" })
    )
  })

  it("turns away a state it didn't send, or a return with no sign-in started", async () => {
    client.getAuthorizationUrlWithPKCE.mockResolvedValue({ url: "u", state: "state-1", codeVerifier: "verifier-1" })
    await authorizationUrl(context, { provider: "microsoft" }, "/")
    await expect(finishOAuth(context, new URLSearchParams({ code: "code-1", state: "forged" }))).resolves.toBe(
      "/login?error=oauth"
    )
    // The round trip is used up either way.
    await expect(finishOAuth(context, new URLSearchParams({ code: "code-1", state: "state-1" }))).resolves.toBe(
      "/login?error=oauth"
    )
    expect(client.authenticateWithCode).not.toHaveBeenCalled()
  })
})
