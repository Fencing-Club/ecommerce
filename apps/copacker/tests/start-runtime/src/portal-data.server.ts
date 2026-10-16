import { getRequestHeader } from "@tanstack/react-start/server"
import { env } from "cloudflare:workers"
import { getTableName, is, sql, Table } from "drizzle-orm"
import { z } from "zod"
import { db, withDatabase, withTransaction } from "@/db"
import * as schema from "@/db/schema"
import type { Access } from "@/lib/access"
import { authentication } from "@/server/auth-session"
import { localization } from "@/server/localization"
import { ownProfile } from "@/server/profile"
import type { workspaceSession } from "@/server/workspace-session"

const buyer = "00000000-0000-4000-8000-000000000011"
const supplier = "00000000-0000-4000-8000-000000000012"

export async function portalData<T>(run: (user: Parameters<typeof workspaceSession>[0] | null) => Promise<T>) {
  // Resolve the profile language before holding the domain transaction. Waiting for a separate locale transaction
  // while holding this connection can deadlock a small Hyperdrive pool.
  await localization()
  return isolatedPortalData(run)
}

export function portalLocale() {
  return isolatedPortalData(async (user) => (user ? (await ownProfile(user.id)).profile?.locale : undefined))
}

// Only the isolated compatibility fixture accepts these scenarios. Deployed requests still need its bearer gate
// and a real WorkOS test session. Locally, the reserved preview identity never contacts WorkOS.
async function isolatedPortalData<T>(run: (user: Parameters<typeof workspaceSession>[0] | null) => Promise<T>) {
  const selected = getRequestHeader("x-probe-portal")
  const scenario = z
    .enum(["owner", "no-membership", "no-overview", "no-prices", "incomplete", "view-only"])
    .parse(selected ?? "owner")
  let access: Access = { orders: "view" }
  if (scenario === "view-only") {
    access = { partners: "view", products: "view" }
  } else if (scenario === "no-prices") {
    access = { overview: "view" }
  }
  const user =
    selected && env.PROBE_MODE === "local"
      ? {
          id: "user_portal_preview",
          email: "preview@example.invalid",
          emailVerified: true,
          firstName: "Alex",
          lastName: "Rivera"
        }
      : (await authentication()).user
  return withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, async () => {
    if (!user) {
      return run(user)
    }
    return db().transaction(async (tx) => {
      // Copy table shapes, never data. All reads and writes below run on this one transaction connection.
      const tables = Object.values(schema).filter((value) => is(value, Table))
      await tx.execute(
        sql.join(
          tables.map(
            (table) =>
              sql`create temporary table ${sql.identifier(getTableName(table))} (like public.${sql.identifier(getTableName(table))} including defaults) on commit drop`
          ),
          sql`; `
        )
      )
      await tx.execute(sql`set local search_path = pg_temp, public`)
      await tx.insert(schema.organizations).values([
        { id: buyer, name: "Harbor Goods", kind: "buyer", createdAt: new Date("2026-01-01") },
        { id: supplier, name: "Lotus Manufacturing", kind: "supplier", createdAt: new Date("2026-01-02") }
      ])
      if (scenario !== "no-membership") {
        await tx.insert(schema.memberships).values([
          {
            orgId: buyer,
            userId: user.id,
            email: user.email,
            role: ["no-prices", "no-overview", "view-only"].includes(scenario) ? "member" : "owner",
            access
          },
          {
            orgId: supplier,
            userId: user.id,
            email: user.email,
            role: ["no-prices", "no-overview", "view-only"].includes(scenario) ? "member" : "owner",
            access
          }
        ])
      }
      await tx.insert(schema.profiles).values({
        userId: user.id,
        firstName: "Alex",
        lastName: "Rivera",
        position: scenario === "incomplete" ? "" : "Operations",
        company: "Harbor Goods",
        locale: getRequestHeader("x-probe-locale") === "ur" ? "ur" : "en"
      })
      return withTransaction(tx, () => run(user))
    })
  })
}
