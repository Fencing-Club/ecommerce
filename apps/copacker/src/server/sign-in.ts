import { passwordResetEmail } from "@repo/copacker-emails"
import type { AuthenticationResponse } from "@workos-inc/node"
import type { PasswordReset } from "@workos-inc/node"
import {
  AuthenticationException,
  BadRequestException,
  GenericServerException,
  NotFoundException,
  RateLimitExceededException
} from "@workos-inc/node"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { organizations, profiles } from "@/db/schema"
import type { ErrorKey } from "@/i18n/errors"
import { LocalizedError } from "@/i18n/errors"
import { isLocale, negotiateLocale } from "@/i18n/locales"
import { translatorFor } from "@/i18n/translator"
import type { OAuthProvider } from "@/lib/sign-in"
import {
  codeSchema,
  forgotPasswordSchema,
  oauthProviders,
  passwordMinimum,
  resetPasswordSchema,
  signInSchema,
  signUpSchema
} from "@/lib/sign-in"
import { sendEmail } from "./email"
import { requestInput } from "./errors"
import { describeError, logEvent } from "./log"
import { appUrl, decrypt, encrypt, returnPath, siteUrlFor } from "./security"
import { workos, workosClientId } from "./workos"
import { workspaceCookie } from "./workspace-session"

// Copacker's own sign-in pages talk to WorkOS directly: email and password, a code emailed to confirm a new address,
// password resets, and Google or Microsoft. Every path ends in AuthKit's session cookie, as the hosted pages did.

// The framework owns request headers, response cookies and the supported session writer. The authentication flows
// stay canonical and never read a process-global request or accept these capabilities from browser input.
export type SignInRequest = {
  headers: Headers
  ipAddress: string | undefined
  cookies: {
    get: (name: string) => { value: string } | undefined
    set: (
      name: string,
      value: string,
      options: { httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string; maxAge: number }
    ) => void
    delete: (name: string) => void
  }
  saveSession: (response: AuthenticationResponse) => Promise<void>
}

// A sign-in waiting on the code WorkOS emailed, kept for as long as the code lasts.
const pendingCookie = "copacker-verify"
const pendingSchema = z.object({
  token: z.string(),
  email: z.string(),
  // The code's id, to send another one.
  verification: z.string().nullable(),
  next: z.string()
})

// An OAuth round trip: the state that must come back, the PKCE verifier, and where to go after.
const oauthCookie = "copacker-oauth"
const oauthSchema = z.object({ state: z.string(), verifier: z.string(), next: z.string() })

const tenMinutes = 600

function seal(request: SignInRequest, name: string, value: unknown) {
  request.cookies.set(name, encrypt(JSON.stringify(value), name), {
    httpOnly: true,
    secure: appUrl().startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: tenMinutes
  })
}

function unseal<T>(request: SignInRequest, name: string, schema: z.ZodType<T>) {
  const value = request.cookies.get(name)?.value
  if (!value) {
    return null
  }
  try {
    return schema.parse(JSON.parse(decrypt(value, name)))
  } catch {
    return null
  }
}

// The address and email the verification code went to, for the code page; null once it's used or has expired.
export function pendingVerification(request: SignInRequest) {
  const pending = unseal(request, pendingCookie, pendingSchema)
  return pending ? { email: pending.email } : null
}

// WorkOS's Radar judges each attempt by the person's own address and browser, not the server's.
function requestContext(request: SignInRequest) {
  return { ipAddress: request.ipAddress, userAgent: request.headers.get("user-agent") ?? undefined }
}

const text = (value: unknown) => (typeof value === "string" ? value : "")

// Messages for the WorkOS error codes a person can cause.
const messages: Record<string, ErrorKey> = {
  invalid_credentials: "incorrectCredentials",
  invalid_one_time_code: "wrongCode",
  invalid_pending_authentication_token: "codeExpired",
  password_reset_token_not_found: "linkExpired",
  password_reset_token_expired: "linkExpired"
}

const detailsSchema = z
  .array(
    z.looseObject({
      code: z.string().optional(),
      message: z.string().optional(),
      warning: z.string().optional(),
      minimum_length: z.number().optional()
    })
  )
  .catch([])

// What to tell someone when WorkOS turns a request down. Anything unexpected is logged and asks for a retry.
function explain(error: unknown) {
  if (error instanceof RateLimitExceededException) {
    return new LocalizedError("tooManyAttempts")
  }
  if (error instanceof BadRequestException) {
    const details = detailsSchema.parse(error.errors)
    const short = details.find((detail) => detail.code === "password_too_short")
    if (short) {
      return new LocalizedError("passwordTooShort", { count: short.minimum_length ?? passwordMinimum })
    }
    const weak = details.find((detail) => detail.code === "password_too_weak")
    if (weak) {
      return weak.warning
        ? new LocalizedError("passwordWeakBecause", { warning: weak.warning })
        : new LocalizedError("passwordWeak")
    }
    if (details.some((detail) => detail.code === "email_not_available")) {
      return new LocalizedError("emailTaken")
    }
    const described = details.find((detail) => detail.message)?.message
    if (described) {
      return new Error(described)
    }
  }
  if (
    (error instanceof GenericServerException || error instanceof NotFoundException) &&
    error.code &&
    messages[error.code]
  ) {
    return new LocalizedError(messages[error.code]!)
  }
  logEvent("error", "sign_in_failed", { error: describeError(error) })
  return new LocalizedError("signInFailed")
}

// The person belongs to one WorkOS organization per workspace, and WorkOS asks which one the session is for. Copacker
// picks its workspace itself, so the session takes the workspace they had open last, or else the first.
async function chooseOrganization(request: SignInRequest, choices: ReadonlyArray<{ id: string }>) {
  const active = z.uuid().safeParse(request.cookies.get(workspaceCookie)?.value)
  if (active.success) {
    const [row] = await db()
      .select({ workosId: organizations.workosId })
      .from(organizations)
      .where(eq(organizations.id, active.data))
    const match = choices.find((choice) => choice.id === row?.workosId)
    if (match) {
      return match.id
    }
  }
  const [first] = choices
  if (!first) {
    throw new LocalizedError("signInFailed")
  }
  return first.id
}

// Saves the session a sign-in produced, or takes it to its next step: the code emailed to a new address, the
// organization WorkOS asks for, or the company's single sign-on. Returns where to go next.
async function complete(
  request: SignInRequest,
  attempt: () => Promise<AuthenticationResponse>,
  next: string
): Promise<{ redirect: string }> {
  let response: AuthenticationResponse
  try {
    response = await attempt()
  } catch (error) {
    if (error instanceof AuthenticationException) {
      const pendingAuthenticationToken = error.pendingAuthenticationToken
      if (error.code === "email_verification_required" && pendingAuthenticationToken) {
        seal(request, pendingCookie, {
          token: pendingAuthenticationToken,
          email: text(error.rawData.email),
          verification: text(error.rawData.email_verification_id) || null,
          next
        })
        return { redirect: "/verify-email" }
      }
      if (error.code === "organization_selection_required" && pendingAuthenticationToken) {
        const organizationId = await chooseOrganization(request, error.rawData.organizations ?? [])
        return complete(
          request,
          () =>
            workos().userManagement.authenticateWithOrganizationSelection({
              clientId: workosClientId(),
              organizationId,
              pendingAuthenticationToken
            }),
          next
        )
      }
      if (error.code === "sso_required") {
        const [connectionId] = z.array(z.string()).catch([]).parse(error.rawData.connection_ids)
        if (connectionId) {
          return { redirect: await authorizationUrl(request, { connectionId }, next) }
        }
      }
    }
    throw explain(error)
  }
  await request.saveSession(response)
  request.cookies.delete(pendingCookie)
  return { redirect: next }
}

// Where to go once signed in: a page on Copacker, or else home.
const next = z
  .string()
  .optional()
  .transform((value) => returnPath(value, "/"))

export async function signIn(request: SignInRequest, raw: unknown) {
  const input = requestInput(signInSchema.extend({ next }), raw)
  const context = requestContext(request)
  return complete(
    request,
    () =>
      workos().userManagement.authenticateWithPassword({
        clientId: workosClientId(),
        email: input.email,
        password: input.password,
        ...context
      }),
    input.next
  )
}

// The address a WorkOS invitation is for, such as one approving a waitlist entry, while it can still be accepted.
export async function invitedEmail(token: string) {
  const invitation = await workos()
    .userManagement.findInvitationByToken(token)
    .catch(() => null)
  return invitation?.state === "pending" ? invitation.email : null
}

// Creates the account, then signs in, which emails a code to confirm the address. Signing in with a WorkOS invitation's
// token accepts it, which confirms the address instead.
export async function signUp(request: SignInRequest, raw: unknown) {
  const input = requestInput(signUpSchema.extend({ next, invitation: z.string().max(200).optional() }), raw)
  const context = requestContext(request)
  try {
    await workos().userManagement.createUser({ email: input.email, password: input.password, ...context })
  } catch (error) {
    throw explain(error)
  }
  return complete(
    request,
    () =>
      workos().userManagement.authenticateWithPassword({
        clientId: workosClientId(),
        email: input.email,
        password: input.password,
        ...(input.invitation ? { invitationToken: input.invitation } : {}),
        ...context
      }),
    input.next
  )
}

export async function verifyEmail(request: SignInRequest, raw: unknown) {
  const { code } = requestInput(codeSchema, raw)
  const pending = unseal(request, pendingCookie, pendingSchema)
  if (!pending) {
    throw new LocalizedError("codeExpired")
  }
  const context = requestContext(request)
  return complete(
    request,
    () =>
      workos().userManagement.authenticateWithEmailVerification({
        clientId: workosClientId(),
        code,
        pendingAuthenticationToken: pending.token,
        ...context
      }),
    pending.next
  )
}

// Emails a new code for the sign-in that's waiting on one.
export async function resendCode(request: SignInRequest) {
  const pending = unseal(request, pendingCookie, pendingSchema)
  if (!pending?.verification) {
    throw new LocalizedError("codeExpired")
  }
  try {
    const { userId } = await workos().userManagement.getEmailVerification(pending.verification)
    await workos().userManagement.sendVerificationEmail({ userId })
  } catch (error) {
    throw explain(error)
  }
  return { ok: true }
}

// Emails a link to Copacker's own reset page. Whether the email has an account isn't revealed: the reply is the same
// either way. WorkOS sends its own reset email too until it's turned off in its dashboard, so a failure to send this
// one is logged rather than shown.
export async function requestPasswordReset(request: SignInRequest, raw: unknown) {
  const input = requestInput(forgotPasswordSchema, raw)
  let reset: PasswordReset
  try {
    reset = await workos().userManagement.createPasswordReset({ email: input.email })
  } catch (error) {
    if (error instanceof NotFoundException) {
      return { ok: true }
    }
    throw explain(error)
  }
  const link = `${siteUrlFor(request.headers)}/reset-password?${new URLSearchParams({ token: reset.passwordResetToken })}`
  try {
    // In the language the person chose in Settings, or else their computer's, from the request.
    const [profile] = await db()
      .select({ locale: profiles.locale })
      .from(profiles)
      .where(eq(profiles.userId, reset.userId))
    const lang = isLocale(profile?.locale) ? profile.locale : negotiateLocale(request.headers.get("accept-language"))
    const t = await translatorFor(lang)
    // How long the link lasts, from WorkOS's expiry: minutes, or hours for an hour or more.
    const minutes = Math.max(1, Math.round((Date.parse(reset.expiresAt) - Date.now()) / 60000))
    await sendEmail({
      to: reset.email,
      key: `password-reset:${reset.id}`,
      ...(await passwordResetEmail({
        appUrl: appUrl(),
        link,
        lang,
        copy: {
          subject: t("emails.passwordReset.subject"),
          eyebrow: t("emails.passwordReset.eyebrow"),
          heading: t("emails.passwordReset.heading"),
          lead: t("emails.passwordReset.lead", { email: reset.email }),
          preview:
            minutes < 60
              ? t("emails.passwordReset.previewMinutes", { email: reset.email, count: minutes })
              : t("emails.passwordReset.previewHours", { email: reset.email, count: Math.round(minutes / 60) }),
          action: t("emails.passwordReset.action"),
          note:
            minutes < 60
              ? t("emails.passwordReset.expiresMinutes", { count: minutes })
              : t("emails.passwordReset.expiresHours", { count: Math.round(minutes / 60) }),
          pasteLink: t("emails.pasteLink"),
          reason: t("emails.passwordReset.reason", { email: reset.email }),
          tagline: t("emails.tagline")
        }
      }))
    })
  } catch (error) {
    logEvent("error", "password_reset_email_failed", { error: describeError(error) })
  }
  return { ok: true }
}

// Sets the new password and signs straight in with it.
export async function resetPassword(request: SignInRequest, raw: unknown) {
  const input = requestInput(resetPasswordSchema.extend({ token: z.string().min(1).max(512) }), raw)
  let resetEmail: string
  try {
    const { user } = await workos().userManagement.resetPassword({ token: input.token, newPassword: input.password })
    resetEmail = user.email
  } catch (error) {
    throw explain(error)
  }
  const context = requestContext(request)
  return complete(
    request,
    () =>
      workos().userManagement.authenticateWithPassword({
        clientId: workosClientId(),
        email: resetEmail,
        password: input.password,
        ...context
      }),
    "/"
  )
}

// Whether an email already has an account, so an invitation can offer to sign in rather than to sign up.
export async function hasAccount(address: string) {
  const { data } = await workos().userManagement.listUsers({ email: address.toLowerCase(), limit: 1 })
  return data.length > 0
}

// Starts an OAuth round trip, with Google or Microsoft or the company's single sign-on, and returns the address to
// send the person to. WorkOS brings them back to /callback.
export async function authorizationUrl(
  request: SignInRequest,
  via: { provider: OAuthProvider } | { connectionId: string },
  destination: string,
  loginHint?: string
) {
  const { url, state, codeVerifier } = await workos().userManagement.getAuthorizationUrlWithPKCE({
    clientId: workosClientId(),
    redirectUri: `${siteUrlFor(request.headers)}/callback`,
    ...("provider" in via ? { provider: oauthProviders[via.provider].provider } : { connectionId: via.connectionId }),
    ...(loginHint && { loginHint })
  })
  seal(request, oauthCookie, { state, verifier: codeVerifier, next: returnPath(destination, "/") })
  return url
}

// Finishes an OAuth round trip. Returns where to go: the page sign-in was for, the code page, or back to sign in with
// an error.
export async function finishOAuth(request: SignInRequest, params: URLSearchParams) {
  const saved = unseal(request, oauthCookie, oauthSchema)
  request.cookies.delete(oauthCookie)
  const code = params.get("code")
  if (!saved || !code || params.get("state") !== saved.state) {
    return "/login?error=oauth"
  }
  const context = requestContext(request)
  try {
    const { redirect } = await complete(
      request,
      () =>
        workos().userManagement.authenticateWithCode({
          clientId: workosClientId(),
          code,
          codeVerifier: saved.verifier,
          ...context
        }),
      saved.next
    )
    return redirect
  } catch {
    // complete() has logged anything unexpected.
    return "/login?error=oauth"
  }
}
