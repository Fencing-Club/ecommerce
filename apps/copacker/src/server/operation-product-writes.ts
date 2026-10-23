import { defineOperation, readMetadata } from "@repo/copacker-contract"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, organizations, supplierProductGroups, supplierProducts } from "@/db/schema"
import { CliError } from "./cli-auth"
import { readProducts } from "./operation-product-reads"
import { productDefaultsInputSchema, saveProductDefaults, readProductDefaults, noDefaults } from "./product-defaults"
import { saveVariantFields, readVariantFields } from "./product-fields"
import { productInputSchema, saveProduct, productDetail } from "./supplier-products"
import type { Session } from "./workspace-session"

function metadata(operation: string) {
  return {
    ...readMetadata(operation, ["products:write"], ["buyer", "supplier"]),
    effects: [
      {
        kind: "local_write" as const,
        description: "Save Copacker product metadata or supplier product data; preserve stock counts."
      }
    ],
    execution: { kind: "mutation" as const, idempotent: true, confirmation: false, readBranches: [] }
  }
}
const variant = productInputSchema.shape.variants.element
  .omit({ onHand: true })
  .extend({ expectedRevision: z.number().int().positive().optional() })
  .strict()
const fields = productInputSchema
  .omit({ id: true, revision: true, variants: true })
  .extend({ variants: z.array(variant).min(1).max(500) })
  .strict()
const saved = z.strictObject({ id: z.string(), revision: z.number().int() })
const variantFields = z.strictObject({
  supplierSku: z.string().max(255).optional(),
  asin: z.string().max(255).optional()
})
export const productWriteDefinitions = {
  "product.supplier.assign": defineOperation(
    {
      ...metadata("product.supplier.assign"),
      accessPolicy: { ...metadata("product.supplier.assign").accessPolicy, workspaceKinds: ["buyer"] }
    },
    z.strictObject({
      id: z.string().min(1),
      supplierId: z.uuid().nullable(),
      expectedRevision: z.number().int().nonnegative(),
      mode: z.literal("direct").default("direct")
    }),
    saved
  ),
  "product.settings.show": defineOperation(
    readMetadata("product.settings.show", ["products:read"], ["buyer", "supplier"]),
    z.strictObject({ id: z.string() }),
    z.union([
      z.strictObject({
        kind: z.literal("buyer"),
        id: z.string(),
        fields: productDefaultsInputSchema.omit({ productId: true })
      }),
      fields.extend({ kind: z.literal("supplier"), id: z.uuid(), expectedRevision: z.number().int().positive() })
    ])
  ),
  "product.variant.update": defineOperation(
    metadata("product.variant.update"),
    z.strictObject({
      variantId: z.string(),
      mode: z.literal("direct").default("direct"),
      expected: z.strictObject({ supplierSku: z.string().nullable(), asin: z.string().nullable() }),
      fields: variantFields
    }),
    z.strictObject({ variantId: z.string(), supplierSku: z.string().nullable(), asin: z.string().nullable() })
  ),
  "product.create": defineOperation(
    {
      ...metadata("product.create"),
      accessPolicy: { ...metadata("product.create").accessPolicy, workspaceKinds: ["supplier"] }
    },
    fields.extend({ clientReference: z.uuid() }),
    saved
  ),
  "product.update": defineOperation(
    metadata("product.update"),
    z.discriminatedUnion("kind", [
      fields.extend({
        kind: z.literal("supplier"),
        id: z.uuid(),
        expectedRevision: z.number().int().positive(),
        mode: z.literal("direct").default("direct")
      }),
      z.strictObject({
        kind: z.literal("buyer"),
        id: z.string(),
        mode: z.literal("direct").default("direct"),
        fields: productDefaultsInputSchema.omit({ productId: true }).strict()
      })
    ]),
    saved
  )
}
async function supplierProduct(
  s: Session,
  input:
    | z.infer<(typeof productWriteDefinitions)["product.create"]["input"]>
    | Extract<z.infer<(typeof productWriteDefinitions)["product.update"]["input"]>, { kind: "supplier" }>
) {
  // Serialize saves with the same group lock as the web editor before locking variants.
  if ("id" in input) {
    const [group] = await db()
      .select()
      .from(supplierProductGroups)
      .where(and(eq(supplierProductGroups.id, input.id), eq(supplierProductGroups.supplierOrgId, s.org.id)))
      .for("update")
    if (!group) {
      throw new CliError("not_found", "Product not found.", 404)
    }
    if (group.revision !== input.expectedRevision) {
      throw new CliError("revision_conflict", "Product changed. Read it again.", 409)
    }
  }
  const existing = await db()
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierOrgId, s.org.id))
    .orderBy(supplierProducts.id)
    .for("update")
  const variants = input.variants.map((variant) => {
    const current = existing.find((row) => row.id === variant.id || row.supplierSku === variant.supplierSku)
    if (current) {
      if (!("id" in input) || current.groupId !== input.id || current.id !== variant.id) {
        throw new CliError("identity_unresolved", "Use the existing variant ID for a saved supplier SKU.", 409)
      }
      if (current.supplierSku !== variant.supplierSku) {
        throw new CliError(
          "identity_unresolved",
          "Supplier SKU renames require stock commitment identity migration.",
          409
        )
      }
      if (current.revision !== variant.expectedRevision) {
        throw new CliError("revision_conflict", "Variant changed. Read it again.", 409)
      }
    } else if (variant.id || variant.expectedRevision) {
      throw new CliError("not_found", "Variant not found.", 404)
    }
    return { ...variant, onHand: current?.onHand ?? 0 }
  })
  return saveProduct(s, { ...input, ...("id" in input ? { revision: input.expectedRevision } : {}), variants })
}
export async function createCliProduct(
  s: Session,
  input: z.infer<(typeof productWriteDefinitions)["product.create"]["input"]>
) {
  return supplierProduct(s, input)
}
export async function updateCliProduct(
  s: Session,
  input: z.infer<(typeof productWriteDefinitions)["product.update"]["input"]>
) {
  if (input.kind !== s.org.kind) {
    throw new CliError("forbidden", "Choose this workspace's product kind.", 403)
  }
  if (input.kind === "supplier") {
    return supplierProduct(s, input)
  }
  await db().select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org.id)).for("update")
  await db()
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
    .orderBy(connections.id)
    .for("update")
  const product = (await readProducts(s)).items.find((row) => row.id === input.id)
  if (!product?.source || product.source.provider !== "shopify") {
    throw new CliError("not_found", "Connected Shopify product not found.", 404)
  }
  await saveProductDefaults(s, { ...input.fields, productId: product.source.externalId })
  const current =
    (await readProductDefaults(s.org.id, product.source.accountId)).get(product.source.externalId) ?? noDefaults
  return { id: input.id, revision: current.revision }
}

export async function productSettings(s: Session, id: string) {
  if (s.org.kind === "supplier") {
    const product = await productDetail(s.org.id, id)
    if (!product) {
      throw new CliError("not_found", "Product not found.", 404)
    }
    return {
      kind: "supplier" as const,
      id,
      expectedRevision: product.group.revision,
      ...fields.strip().parse({
        ...product.group,
        status: product.status,
        category: product.group.category ?? "",
        productCode: product.group.productCode ?? "",
        url: product.group.url ?? "",
        description: product.group.description ?? "",
        variants: product.variants.map((row) => ({ ...variant.strip().parse(row), expectedRevision: row.revision }))
      })
    }
  }
  const product = (await readProducts(s)).items.find((row) => row.id === id)
  if (!product?.source || product.source.provider !== "shopify") {
    throw new CliError("not_found", "Connected Shopify product not found.", 404)
  }
  const { revision, ...defaults } =
    (await readProductDefaults(s.org.id, product.source.accountId)).get(product.source.externalId) ?? noDefaults
  return { kind: "buyer" as const, id, fields: { ...defaults, expectedRevision: revision } }
}
export async function assignCliProductSupplier(
  s: Session,
  input: z.infer<(typeof productWriteDefinitions)["product.supplier.assign"]["input"]>
) {
  const settings = await productSettings(s, input.id)
  if (settings.kind !== "buyer") {
    throw new CliError("forbidden", "Supplier assignment requires a buyer workspace.", 403)
  }
  // The same guarded product save validates the current supplier relationship and preserves other settings.
  return updateCliProduct(s, {
    kind: "buyer",
    id: input.id,
    mode: "direct",
    fields: { ...settings.fields, supplierId: input.supplierId, expectedRevision: input.expectedRevision }
  })
}
export async function updateCliVariant(
  s: Session,
  input: z.infer<(typeof productWriteDefinitions)["product.variant.update"]["input"]>
) {
  await db().select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org.id)).for("update")
  await db()
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
    .orderBy(connections.id)
    .for("update")
  const variant = (await readProducts(s)).items.flatMap((row) => row.variants).find((row) => row.id === input.variantId)
  if (!variant?.source || variant.source.provider !== "shopify") {
    throw new CliError("not_found", "Connected Shopify variant not found.", 404)
  }
  const current = (await readVariantFields(s.org.id, variant.source.accountId, [variant.source.externalId])).get(
    variant.source.externalId
  )
  if (
    (current?.supplierSku ?? null) !== input.expected.supplierSku ||
    (current?.asin ?? null) !== input.expected.asin
  ) {
    throw new CliError("revision_conflict", "Variant metadata changed. Read it again.", 409)
  }
  const result = await saveVariantFields(s, { variantId: variant.source.externalId, ...input.fields })
  return { variantId: input.variantId, supplierSku: result.supplierSku, asin: result.asin }
}
