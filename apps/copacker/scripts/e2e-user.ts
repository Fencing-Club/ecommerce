// The account the Playwright suite (e2e/) signs in with. It lives in the WorkOS environment the app under test uses, and
// its password is derived from that environment's API key, so the seed script, every CI run and a local run agree on it
// without a stored secret.
import { createHmac } from "node:crypto"
import { WorkOS } from "@workos-inc/node"

// example.net, not example.com: WorkOS staging's test SSO organization claims example.com.
export const e2eEmail = process.env.E2E_EMAIL ?? "copacker-e2e@example.net"

export function e2eWorkos() {
  return new WorkOS(apiKey())
}

function apiKey() {
  const key = process.env.WORKOS_API_KEY
  if (!key) {
    throw new Error("WORKOS_API_KEY is required to sign in the end-to-end tests")
  }
  return key
}

export function e2ePassword() {
  return `E2e-${createHmac("sha256", apiKey()).update(e2eEmail).digest("base64url")}`
}

// Creates the account with a confirmed email the first time. With reset, it also sets the password again, for an
// account whose password was changed by hand.
export async function e2eUser({ reset = false } = {}) {
  const workos = e2eWorkos()
  const {
    data: [existing]
  } = await workos.userManagement.listUsers({ email: e2eEmail })
  if (!existing) {
    return workos.userManagement.createUser({
      email: e2eEmail,
      password: e2ePassword(),
      firstName: "Casey",
      lastName: "Tester",
      emailVerified: true
    })
  }
  if (reset || !existing.emailVerified) {
    return workos.userManagement.updateUser({
      userId: existing.id,
      emailVerified: true,
      ...(reset ? { password: e2ePassword() } : {})
    })
  }
  return existing
}
