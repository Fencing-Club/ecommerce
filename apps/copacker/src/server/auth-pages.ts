import type { AuthPageData, AuthPageKind, AuthSearch } from "@/lib/auth-pages"
import { returnPath } from "./security"
import { invitedEmail, pendingVerification, type SignInRequest } from "./sign-in"

type PageResult = { page: AuthPageData } | { redirect: string }
type AuthPageRequest = {
  signedIn: () => Promise<boolean>
  signInRequest: () => SignInRequest | Promise<SignInRequest>
}

// Resolve only the data each form renders. Tokens for pending verification stay in the encrypted cookie.
export async function loadAuthPage(
  kind: AuthPageKind,
  query: AuthSearch,
  request: AuthPageRequest
): Promise<PageResult> {
  if (kind === "login" || kind === "signup") {
    if (!process.env.WORKOS_CLIENT_ID) {
      return { redirect: "/setup" }
    }
    const next = returnPath(query.next, "/")
    if (await request.signedIn()) {
      return { redirect: next }
    }
    if (kind === "login") {
      return { page: { kind, next, email: query.email, failed: Boolean(query.error) } }
    }
    const invited = query.invitation_token ? await invitedEmail(query.invitation_token) : null
    return {
      page: { kind, next, email: invited ?? query.email, ...(invited && { invitation: query.invitation_token }) }
    }
  }
  if (kind === "verify-email") {
    const pending = pendingVerification(await request.signInRequest())
    return pending ? { page: { kind, email: pending.email } } : { redirect: "/login" }
  }
  if (kind === "forgot-password") {
    return { page: { kind, email: query.email } }
  }
  return { page: { kind, token: query.token } }
}
