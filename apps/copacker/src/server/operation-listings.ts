import { listingSchema } from "@repo/copacker-contract"
import { and, eq, sql, inArray, or } from "drizzle-orm"
import { db } from "@/db"
import { channelListings, connections, organizations, providerWrites } from "@/db/schema"
import { can } from "@/lib/access"
import { CliError } from "./cli-auth"
import { readProducts } from "./operation-product-reads"
import type { Session } from "./workspace-session"

function publicListing(s: Session, row: typeof channelListings.$inferSelect) {
  return listingSchema.parse({
    id: row.id,
    revision: row.revision,
    linkRevision: row.linkRevision,
    source: {
      connectionId: row.connectionId,
      provider: "amazon",
      accountId: row.accountId,
      marketplaceId: row.marketplaceId,
      externalId: row.sellerSku
    },
    sellerSku: row.sellerSku,
    asin: row.asin,
    fulfillmentMode: row.fulfillmentMode,
    variantId: row.variantId,
    piecesPerListing: row.piecesPerListing,
    inventoryOwner: row.inventoryOwner,
    price:
      can(s, "prices") && row.amountMinor !== null && row.currency
        ? { amountMinor: row.amountMinor, currency: row.currency }
        : null,
    availability: row.fulfillmentMode === "fbm" ? row.quantity : null,
    availabilityLocationId: row.fulfillmentMode === "fbm" ? `listing:${row.id}` : null,
    active: row.active,
    observedAt: row.observedAt.toISOString(),
    capabilities: [
      { field: "sku", writable: false, reason: "Amazon seller SKU renaming is not supported." },
      {
        field: "price",
        writable: row.active && row.variantId !== null && can(s, "products", "edit") && can(s, "prices"),
        reason: "Change the source variant's price through a reviewed provider write."
      },
      {
        field: "inventory",
        writable:
          row.active &&
          row.variantId !== null &&
          row.inventoryOwner === "manual" &&
          row.fulfillmentMode === "fbm" &&
          can(s, "products", "edit") &&
          can(s, "inventory", "edit"),
        reason:
          row.fulfillmentMode === "fba"
            ? "Reported Amazon stock is read-only."
            : "Only explicitly manual merchant availability can be written; preflight checks current ownership."
      }
    ]
  })
}
export async function readListings(s: Session) {
  const rows = await db()
    .select({ listing: channelListings })
    .from(channelListings)
    .innerJoin(
      connections,
      and(
        eq(connections.id, channelListings.connectionId),
        eq(connections.orgId, channelListings.orgId),
        eq(connections.externalId, channelListings.accountId)
      )
    )
    .where(eq(channelListings.orgId, s.org.id))
  return rows.map(({ listing }) => publicListing(s, listing))
}
export async function linkListing(
  s: Session,
  input: {
    id: string
    expectedRevision: number
    expectedLinkRevision: number
    variantId?: string
    piecesPerListing?: number
    inventoryOwner?: "external" | "manual"
  }
) {
  await db().select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org.id)).for("update")
  await db()
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
    .orderBy(connections.id)
    .for("update")
  const [row] = await db()
    .select()
    .from(channelListings)
    .where(and(eq(channelListings.id, input.id), eq(channelListings.orgId, s.org.id)))
    .for("update")
  if (!row || !(await readListings(s)).some((listing) => listing.id === input.id)) {
    throw new CliError("not_found", "Listing not found.", 404)
  }
  if (row.revision !== input.expectedRevision || row.linkRevision !== input.expectedLinkRevision) {
    throw new CliError("revision_conflict", "Read the listing again before changing its link.", 409)
  }
  const [busy] = await db()
    .select({ id: providerWrites.id })
    .from(providerWrites)
    .where(
      and(
        eq(providerWrites.orgId, s.org.id),
        inArray(providerWrites.status, ["queued", "running", "needs_attention"]),
        or(eq(providerWrites.variantId, row.variantId ?? ""), eq(providerWrites.variantId, input.variantId ?? ""))
      )
    )
    .limit(1)
  if (busy) {
    throw new CliError(
      "write_in_progress",
      "Resolve the variant's pending provider change before modifying its listing links.",
      409
    )
  }
  if (input.variantId) {
    if (!row.active) {
      throw new CliError("invalid_state", "Refresh this listing before linking it.", 409)
    }
    if (row.variantId && row.variantId !== input.variantId) {
      throw new CliError("invalid_state", "Unlink the current variant before selecting another.", 409)
    }
    const variants = (await readProducts(s)).items.flatMap((product) => product.variants)
    if (!variants.some((variant) => variant.id === input.variantId && variant.source?.provider === "shopify")) {
      throw new CliError("not_found", "Select a current Shopify variant in this workspace.", 404)
    }
    if (input.inventoryOwner === "manual" && row.fulfillmentMode !== "fbm") {
      throw new CliError("invalid_state", "Only merchant-fulfilled offer availability can be manually managed.", 409)
    }
  }
  const [saved] = await db()
    .update(channelListings)
    .set({
      variantId: input.variantId ?? null,
      piecesPerListing: input.piecesPerListing ?? null,
      inventoryOwner: input.variantId ? (input.inventoryOwner ?? "external") : "external",
      linkRevision: sql`${channelListings.linkRevision} + 1`
    })
    .where(eq(channelListings.id, row.id))
    .returning()
  return publicListing(s, saved!)
}
