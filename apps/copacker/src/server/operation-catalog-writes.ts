import { defineOperation, readMetadata } from "@repo/copacker-contract"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { catalogs, suppliers, organizations } from "@/db/schema"
import { can } from "@/lib/access"
import { catalogInputSchema, saveCatalog, assignCatalog } from "./catalogs"
import { CliError } from "./cli-auth"
import { readCatalog, catalogDefinitions } from "./operation-purchasing-reads"
import type { Session } from "./workspace-session"

function metadata(operation: string) {
  return {
    ...readMetadata(operation, ["catalogs:write"], ["supplier"]),
    effects: [{ kind: "local_write" as const, description: "Change a supplier catalog and its customer assignments." }],
    execution: { kind: "mutation" as const, idempotent: true, confirmation: false, readBranches: [] }
  }
}
const fields = catalogInputSchema
  .omit({ id: true, revision: true, products: true })
  .extend({
    expectedAssignments: z
      .array(z.strictObject({ customerId: z.uuid(), catalogId: z.uuid().nullable() }))
      .max(5000)
      .default([]),
    products: z
      .array(
        z.strictObject({
          variantId: z.uuid(),
          ...catalogInputSchema.shape.products.element.omit({ productId: true }).shape
        })
      )
      .max(50000)
  })
  .strict()
export const catalogWriteDefinitions = {
  "catalog.create": defineOperation(
    metadata("catalog.create"),
    fields.extend({ clientReference: z.uuid() }),
    catalogDefinitions["catalog.show"].output
  ),
  "catalog.update": defineOperation(
    metadata("catalog.update"),
    fields.extend({ id: z.uuid(), expectedRevision: z.number().int().positive() }),
    catalogDefinitions["catalog.show"].output
  ),
  "partners.catalog.assign": defineOperation(
    metadata("partners.catalog.assign"),
    z.strictObject({
      id: z.uuid(),
      type: z.literal("customer"),
      catalogId: z.uuid().nullable(),
      expectedCatalogId: z.uuid().nullable()
    }),
    z.strictObject({ id: z.uuid(), catalogId: z.uuid().nullable() })
  ),
  "partners.catalog.remove": defineOperation(
    metadata("partners.catalog.remove"),
    z.strictObject({ id: z.uuid(), type: z.literal("customer"), expectedCatalogId: z.uuid() }),
    z.strictObject({ id: z.uuid(), catalogId: z.null() })
  )
}
export async function writeCatalog(
  s: Session,
  input:
    | z.infer<(typeof catalogWriteDefinitions)["catalog.create"]["input"]>
    | z.infer<(typeof catalogWriteDefinitions)["catalog.update"]["input"]>
) {
  if (!can(s, "customers", "edit")) {
    throw new CliError("forbidden", "Editing catalog assignments requires customer editing access.", 403)
  }
  await db().select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org.id)).for("update")
  if ("id" in input) {
    const [current] = await db()
      .select()
      .from(catalogs)
      .where(and(eq(catalogs.id, input.id), eq(catalogs.supplierOrgId, s.org.id)))
      .for("update")
    if (!current) {
      throw new CliError("not_found", "Catalog not found.", 404)
    }
    if (current.revision !== input.expectedRevision) {
      throw new CliError("revision_conflict", "Read the catalog again before editing.", 409)
    }
  }
  const assignments = await db().select().from(suppliers).where(eq(suppliers.supplierOrgId, s.org.id)).for("update")
  const changed = assignments.filter(
    (row) => !row.removedAt && (input.customerIds.includes(row.id) || ("id" in input && row.catalogId === input.id))
  )
  if (
    changed.some(
      (row) => input.expectedAssignments.find((expected) => expected.customerId === row.id)?.catalogId !== row.catalogId
    )
  ) {
    throw new CliError("revision_conflict", "Supply the current catalog assignment for every affected customer.", 409)
  }
  const saved = await saveCatalog(s, {
    ...input,
    ...("id" in input ? { revision: input.expectedRevision } : {}),
    products: input.products.map(({ variantId, ...entry }) => ({ ...entry, productId: variantId }))
  })
  return readCatalog(s, saved.id)
}
export async function writeCatalogAssignment(
  s: Session,
  input: z.infer<(typeof catalogWriteDefinitions)["partners.catalog.assign"]["input"]>
) {
  await db().select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org.id)).for("update")
  const [current] = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, input.id), eq(suppliers.supplierOrgId, s.org.id)))
    .for("update")
  if (!current || current.removedAt) {
    throw new CliError("not_found", "Customer not found.", 404)
  }
  if (current.catalogId !== input.expectedCatalogId) {
    throw new CliError("revision_conflict", "The customer's catalog changed. Read it again.", 409)
  }
  await assignCatalog(s, input.id, input.catalogId)
  return { id: input.id, catalogId: input.catalogId }
}
