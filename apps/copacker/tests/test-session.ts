import { effectiveAccess } from "../src/lib/access"
import type * as Auth from "../src/server/auth"
import type { Session } from "../src/server/workspace-session"

// The session workspaceSession builds for a workspace's owner, or for a role and its page access. The workspace is
// named after its kind unless `name` says otherwise.
export function testSession({
  orgId,
  kind,
  name = kind,
  role = "owner",
  access = {}
}: {
  orgId: string
  kind: Session["org"]["kind"]
  name?: string
  role?: Session["role"]
  access?: Session["access"]
}): Session {
  return {
    user: { id: `user-${orgId}`, email: "owner@example.com", emailVerified: true, name: "Olive Owner" },
    org: {
      id: orgId,
      kind,
      name,
      workosId: null,
      timeZone: null,
      excludedShopifyTags: ["Amazon"],
      settingsRevision: 0,
      restockSalesDays: null,
      restockLeadTimeDays: null,
      createdAt: new Date()
    },
    role,
    // As workspaceSession reads a membership's saved access.
    access: effectiveAccess(kind, access),
    workspaces: []
  }
}

// Who the mocked `session()` returns. Null is signed out, which an API request answers with 401.
export const signedIn: { actor: Session | null } = { actor: null }

// The auth module with `session()` reading `signedIn`:
// `vi.mock("../src/server/auth", async (original) => (await import("./test-session")).mockAuth(original))`.
export async function mockAuth(importOriginal: <T>() => Promise<T>) {
  const auth = await importOriginal<typeof Auth>()
  return {
    ...auth,
    session: async () => {
      if (!signedIn.actor) {
        throw new auth.ApiSessionError(401)
      }
      return signedIn.actor
    }
  }
}
