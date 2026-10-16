import { z } from "zod"

export const authPageKinds = ["login", "signup", "verify-email", "forgot-password", "reset-password"] as const
export const authSearch = z.object({
  next: z.string().optional().catch(undefined),
  email: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
  invitation_token: z.string().optional().catch(undefined),
  token: z.string().optional().catch(undefined)
})
export type AuthSearch = z.infer<typeof authSearch>
export type AuthPageKind = (typeof authPageKinds)[number]
export type AuthPageData =
  | { kind: "login"; next: string; email?: string; failed: boolean }
  | { kind: "signup"; next: string; email?: string; invitation?: string }
  | { kind: "verify-email"; email: string }
  | { kind: "forgot-password"; email?: string }
  | { kind: "reset-password"; token?: string }

export const authTitle = {
  login: "login.title",
  signup: "signup.title",
  "verify-email": "verifyEmail.title",
  "forgot-password": "forgotPassword.title",
  "reset-password": "resetPassword.title"
} as const
