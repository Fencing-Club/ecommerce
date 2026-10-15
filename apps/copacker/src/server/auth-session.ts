import type { AuthenticationResponse } from "@workos-inc/node"
import { getConfig, sessionEncryption, type Session } from "@workos/authkit-session"
import { getAuthkit } from "@workos/authkit-tanstack-react-start"

// Custom password/verification/OAuth flows all use the same public AuthKit storage API. Keep the existing seal format
// and TTL: WorkOS validates token expiry and refreshes the session; the cookie has its own lifetime.
export async function saveAuthentication(response: AuthenticationResponse) {
  const session: Session = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    ...(response.impersonator && { impersonator: response.impersonator })
  }
  const encrypted = await sessionEncryption.sealData(session, {
    password: getConfig("cookiePassword"),
    ttl: 0
  })
  return (await getAuthkit()).saveSession(undefined, encrypted)
}
