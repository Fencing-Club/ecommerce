import { z } from "zod"

// What the sign-in pages ask for, checked the same way in the browser and on the server.

// WorkOS's own minimum; it also turns down common and breached passwords. The auth.validation.passwordTooShort
// message states it.
export const passwordMinimum = 10

export const oauthProviders = {
  google: { name: "Google", provider: "GoogleOAuth" },
  microsoft: { name: "Microsoft", provider: "MicrosoftOAuth" }
} as const
export type OAuthProvider = keyof typeof oauthProviders

export function isOAuthProvider(value: string): value is OAuthProvider {
  return Object.hasOwn(oauthProviders, value)
}

const email = z.email("auth.validation.enterEmail").max(254)

export const newPasswordSchema = z
  .string()
  .min(passwordMinimum, "auth.validation.passwordTooShort")
  .max(256, "auth.validation.passwordTooLong")

export const signInSchema = z.object({ email, password: z.string().min(1, "auth.validation.enterPassword").max(256) })

export const signUpSchema = z.object({ email, password: newPasswordSchema })

export const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "auth.validation.enterCode") })

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z.object({ password: newPasswordSchema })
