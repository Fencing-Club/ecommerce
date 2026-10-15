import type { ActionResult } from "@/lib/api"
import {
  requestPasswordReset,
  resendCode,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
  type SignInRequest
} from "./sign-in"

export const signInActions = new Map<string, (request: SignInRequest, data: unknown) => Promise<ActionResult>>([
  ["auth.signIn", signIn],
  ["auth.signUp", signUp],
  ["auth.verifyEmail", verifyEmail],
  ["auth.resendCode", resendCode],
  ["auth.forgotPassword", requestPasswordReset],
  ["auth.resetPassword", resetPassword]
])
