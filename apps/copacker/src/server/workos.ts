import { WorkOS } from "@workos-inc/node"

// Copacker's own WorkOS calls: signing in and up, and each workspace's organization. AuthKit keeps the session cookie.
export function workos() {
  return new WorkOS(process.env.WORKOS_API_KEY, { clientId: workosClientId() })
}

export function workosClientId() {
  return process.env.WORKOS_CLIENT_ID ?? ""
}
