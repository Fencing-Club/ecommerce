import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { supplierProfiles, suppliers } from "@/db/schema"
import { listForwarders } from "./forwarders"
import { pickupAddressesBySupplier } from "./supplier-addresses"

// Each supplier, joined ones first, with its contact details and pickup addresses: the buyer's until the supplier
// joins, then the supplier's own.
async function loadSuppliers(orgId: string) {
  const rows = await db()
    .select({ supplier: suppliers, profile: supplierProfiles })
    .from(suppliers)
    .leftJoin(supplierProfiles, eq(supplierProfiles.orgId, suppliers.supplierOrgId))
    .where(and(eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
    .orderBy(sql`${suppliers.supplierOrgId} is null`, sql`lower(${suppliers.name})`)
  const addresses = await pickupAddressesBySupplier(rows.map(({ supplier }) => supplier))
  const now = Date.now()
  return rows.map(({ supplier, profile }) => {
    const source = supplier.supplierOrgId ? profile : supplier
    return {
      ...supplier,
      contact: {
        website: source?.website ?? null,
        contactName: source?.contactName ?? null,
        contactEmail: source?.contactEmail ?? null,
        phoneNumber: source?.phoneNumber ?? null
      },
      addresses: addresses.get(supplier.id) ?? [],
      expired: supplier.expiresAt !== null && supplier.expiresAt.getTime() < now
    }
  })
}

export type PartnerSupplier = Awaited<ReturnType<typeof loadSuppliers>>[number]
export type PartnerForwarder = Awaited<ReturnType<typeof listForwarders>>[number]

// Everyone the buyer works with: its suppliers and its freight forwarders, by name.
export async function listPartners(orgId: string) {
  const [supplierRows, forwarderRows] = await Promise.all([loadSuppliers(orgId), listForwarders(orgId)])
  return [
    ...supplierRows.map((row) => ({ type: "supplier" as const, id: row.id, name: row.name, supplier: row })),
    ...forwarderRows.map((row) => ({ type: "forwarder" as const, id: row.id, name: row.name, forwarder: row }))
  ].toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}
