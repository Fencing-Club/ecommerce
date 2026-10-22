import { requestPasswordReset, resendCode, resetPassword, signIn, signUp, verifyEmail } from "@/server/sign-in"
import { fields, publicAction } from "./define"

// Signing in and up, before anyone is signed in. See auth.md.
export const signInActions = {
  "auth.signIn": publicAction({ input: fields, run: (data, request) => signIn(request, data) }),
  "auth.signUp": publicAction({ input: fields, run: (data, request) => signUp(request, data) }),
  "auth.verifyEmail": publicAction({ input: fields, run: (data, request) => verifyEmail(request, data) }),
  "auth.resendCode": publicAction({ input: fields, run: (_data, request) => resendCode(request) }),
  "auth.forgotPassword": publicAction({ input: fields, run: (data, request) => requestPasswordReset(request, data) }),
  "auth.resetPassword": publicAction({ input: fields, run: (data, request) => resetPassword(request, data) })
}
