import { passwordResetEmail } from "@repo/copacker-emails"
import { saveSession } from "@workos-inc/authkit-nextjs"
import {
  AuthenticationException,
  type AuthenticationResponse,
  BadRequestException,
  GenericServerException,
  NotFoundException,
  type PasswordReset,
  RateLimitExceededException
} from "@workos-inc/node"
import { eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { z } from "zod"
import { db } from "@/db"
import { organizations, profiles } from "@/db/schema"
import { LocalizedError, type ErrorKey } from "@/i18n/errors"
import { isLocale, negotiateLocale } from "@/i18n/locales"
import { translatorFor } from "@/i18n/translator"
import {
  codeSchema,
  forgotPasswordSchema,
  type OAuthProvider,
  oauthProviders,
  passwordMinimum,
  resetPasswordSchema,
  signInSchema,
  signUpSchema
} from "@/lib/sign-in"
import { workspaceCookie } from "./auth"
import { sendEmail } from "./email"
import { appUrl, decrypt, encrypt, returnPath } from "./security"
import { siteUrl } from "./site"
import { workos, workosClientId } from "./workos"

// Copacker's own sign-in pages talk to WorkOS directly: email and password, a code emailed to confirm a new address,
// password resets, and Google or Microsoft. Every path ends in AuthKit's session cookie, as the hosted pages did.

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

async function seal(name: string, value: unknown) {
  ;(await cookies()).set(name, encrypt(JSON.stringify(value), name), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: tenMinutes
  })
}

async function unseal<T>(name: string, schema: z.ZodType<T>) {
  const value = (await cookies()).get(name)?.value
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
export async function pendingVerification() {
  return unseal(pendingCookie, pendingSchema)
}

// WorkOS's Radar judges each attempt by the person's own address and browser, not the server's.
async function requestContext() {
  const list = await headers()
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim()
  return { ipAddress: forwarded || list.get("x-real-ip") || undefined, userAgent: list.get("user-agent") ?? undefined }
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
  console.error("Sign-in failed", error)
  return new LocalizedError("signInFailed")
}

// The person belongs to one WorkOS organization per workspace, and WorkOS asks which one the session is for. Copacker
// picks its workspace itself, so the session takes the workspace they had open last, or else the first.
async function chooseOrganization(choices: ReadonlyArray<{ id: string }>) {
  const active = z.uuid().safeParse((await cookies()).get(workspaceCookie)?.value)
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
async function complete(attempt: () => Promise<AuthenticationResponse>, next: string): Promise<{ redirect: string }> {
  let response: AuthenticationResponse
  try {
    response = await attempt()
  } catch (error) {
    if (error instanceof AuthenticationException) {
      const pendingAuthenticationToken = error.pendingAuthenticationToken
      if (error.code === "email_verification_required" && pendingAuthenticationToken) {
        await seal(pendingCookie, {
          token: pendingAuthenticationToken,
          email: text(error.rawData.email),
          verification: text(error.rawData.email_verification_id) || null,
          next
        })
        return { redirect: "/verify-email" }
      }
      if (error.code === "organization_selection_required" && pendingAuthenticationToken) {
        const organizationId = await chooseOrganization(error.rawData.organizations ?? [])
        return complete(
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
          return { redirect: await authorizationUrl({ connectionId }, next) }
        }
      }
    }
    throw explain(error)
  }
  await saveSession(response, appUrl())
  ;(await cookies()).delete(pendingCookie)
  return { redirect: next }
}

// Where to go once signed in: a page on Copacker, or else home.
const next = z
  .string()
  .optional()
  .transform((value) => returnPath(value, "/"))

export async function signIn(raw: unknown) {
  const input = signInSchema.extend({ next }).parse(raw)
  const context = await requestContext()
  return complete(
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
export async function signUp(raw: unknown) {
  const input = signUpSchema.extend({ next, invitation: z.string().max(200).optional() }).parse(raw)
  const context = await requestContext()
  try {
    await workos().userManagement.createUser({ email: input.email, password: input.password, ...context })
  } catch (error) {
    throw explain(error)
  }
  return complete(
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

export async function verifyEmail(raw: unknown) {
  const { code } = codeSchema.parse(raw)
  const pending = await pendingVerification()
  if (!pending) {
    throw new LocalizedError("codeExpired")
  }
  const context = await requestContext()
  return complete(
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
export async function resendCode() {
  const pending = await pendingVerification()
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
export async function requestPasswordReset(raw: unknown) {
  const input = forgotPasswordSchema.parse(raw)
  let reset: PasswordReset
  try {
    reset = await workos().userManagement.createPasswordReset({ email: input.email })
  } catch (error) {
    if (error instanceof NotFoundException) {
      return { ok: true }
    }
    throw explain(error)
  }
  const link = `${await siteUrl()}/reset-password?${new URLSearchParams({ token: reset.passwordResetToken })}`
  try {
    // In the language the person chose in Settings, or else their computer's, from the request.
    const [profile] = await db()
      .select({ locale: profiles.locale })
      .from(profiles)
      .where(eq(profiles.userId, reset.userId))
    const lang = isLocale(profile?.locale) ? profile.locale : negotiateLocale((await headers()).get("accept-language"))
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
    console.error("Couldn’t send the password reset email", error)
  }
  return { ok: true }
}

// Sets the new password and signs straight in with it.
export async function resetPassword(raw: unknown) {
  const input = resetPasswordSchema.extend({ token: z.string().min(1).max(512) }).parse(raw)
  let resetEmail: string
  try {
    const { user } = await workos().userManagement.resetPassword({ token: input.token, newPassword: input.password })
    resetEmail = user.email
  } catch (error) {
    throw explain(error)
  }
  const context = await requestContext()
  return complete(
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

// WorkOS returns to the address sign-in started on, so its session cookie lands there.
async function redirectUri() {
  return `${await siteUrl()}/callback`
}

// Starts an OAuth round trip, with Google or Microsoft or the company's single sign-on, and returns the address to
// send the person to. WorkOS brings them back to /callback.
export async function authorizationUrl(
  via: { provider: OAuthProvider } | { connectionId: string },
  destination: string,
  loginHint?: string
) {
  const { url, state, codeVerifier } = await workos().userManagement.getAuthorizationUrlWithPKCE({
    clientId: workosClientId(),
    redirectUri: await redirectUri(),
    ...("provider" in via ? { provider: oauthProviders[via.provider].provider } : { connectionId: via.connectionId }),
    ...(loginHint && { loginHint })
  })
  await seal(oauthCookie, { state, verifier: codeVerifier, next: returnPath(destination, "/") })
  return url
}

// Finishes an OAuth round trip. Returns where to go: the page sign-in was for, the code page, or back to sign in with
// an error.
export async function finishOAuth(params: URLSearchParams) {
  const saved = await unseal(oauthCookie, oauthSchema)
  ;(await cookies()).delete(oauthCookie)
  const code = params.get("code")
  if (!saved || !code || params.get("state") !== saved.state) {
    return "/login?error=oauth"
  }
  const context = await requestContext()
  try {
    const { redirect } = await complete(
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
