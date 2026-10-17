import { env } from "cloudflare:workers"
import { and, eq, sql } from "drizzle-orm"
import invariant from "tiny-invariant"
import { db, withDatabase } from "../../../src/db"
import { memberships, organizations } from "../../../src/db/schema"
import { AccessError } from "../../../src/i18n/errors"
import { authentication } from "../../../src/server/auth-session"
import { requireAccess } from "../../../src/server/authorization"
import { workspaceSession } from "../../../src/server/workspace-session"

// Real session validation followed by the canonical workspace queries. All test records belong to connection-local
// temporary tables in one transaction; neither existing staging memberships nor profiles are read or changed.
export async function workspaceProbe() {
  const { user } = await authentication()
  if (!user) {
    return new Response(null, { status: 401 })
  }
  const result = await withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, () =>
    db().transaction(async (tx) => {
      await tx.execute(
        sql`create temporary table organizations (like public.organizations including defaults) on commit drop`
      )
      await tx.execute(
        sql`create temporary table memberships (like public.memberships including defaults) on commit drop`
      )
      await tx.execute(sql`create temporary table profiles (like public.profiles including defaults) on commit drop`)
      await tx.execute(sql`set local search_path = pg_temp, public`)
      const buyer = "00000000-0000-4000-8000-000000000001"
      const supplier = "00000000-0000-4000-8000-000000000002"
      const foreign = "00000000-0000-4000-8000-000000000003"
      await tx.insert(organizations).values([
        { id: buyer, name: "Probe buyer", kind: "buyer", createdAt: new Date("2026-01-01") },
        { id: supplier, name: "Probe supplier", kind: "supplier", createdAt: new Date("2026-01-02") },
        { id: foreign, name: "Probe other tenant", kind: "buyer" }
      ])
      await tx.insert(memberships).values([
        { orgId: buyer, userId: user.id, email: user.email, role: "owner" },
        { orgId: supplier, userId: user.id, email: user.email, role: "member", access: { orders: "view" } },
        { orgId: foreign, userId: "user_probe_other", email: "other@example.invalid", role: "owner" }
      ])
      const selected = await workspaceSession(user, supplier, tx)
      invariant(selected?.org.id === supplier && selected.role === "member", "Wrong selected membership")
      requireAccess(selected, "orders")
      let denied = false
      try {
        requireAccess(selected, "orders", "edit")
      } catch (error) {
        if (!(error instanceof AccessError)) {
          throw error
        }
        denied = true
      }
      invariant(denied, "A read-only membership must not authorize writes")
      const forged = await workspaceSession(user, foreign, tx)
      invariant(forged === null, "A foreign workspace cookie must not grant membership")
      await tx
        .update(memberships)
        .set({ access: { orders: "edit" } })
        .where(and(eq(memberships.orgId, supplier), eq(memberships.userId, user.id)))
      const updated = await workspaceSession(user, supplier, tx)
      invariant(updated, "Updated membership must exist")
      requireAccess(updated, "orders", "edit")
      await tx.delete(memberships).where(and(eq(memberships.orgId, supplier), eq(memberships.userId, user.id)))
      const revoked = await workspaceSession(user, supplier, tx)
      invariant(revoked === null, "Revoked membership was retained")
      return {
        selectedRole: selected.role,
        deniedEdit: denied,
        foreignCookieRejected: true,
        permissionChangeApplied: true,
        revokedMembershipRemoved: true,
        switcherKeys: Object.keys(selected.workspaces[0]!).toSorted()
      }
    })
  )
  return Response.json(result)
}
