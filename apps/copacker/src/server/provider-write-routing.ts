import { canonicalJson, type productReadOperations } from "@repo/copacker-contract"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { amazonListingValues, readAmazonListing, readShopifyWrite } from "@repo/copacker-marketplaces/listing-writes"
import { shopifyLocationKind } from "@repo/copacker-marketplaces/shopify"
import { and, eq, inArray } from "drizzle-orm"
import type { z } from "zod"
import { db } from "@/db"
import { channelListings, connections, inventoryLocationMappings } from "@/db/schema"
import { can } from "@/lib/access"
import { CliError } from "./cli-auth"
import { amazonFor, shopifyFor } from "./connections"
import { inventoryLocationEnabled } from "./inventory-connectors"
import { automaticClassification } from "./inventory-locations"
import { readProducts, scopedReadId } from "./operation-product-reads"
import { type writeIntent, type WriteDestination } from "./provider-write-model"
import { hash } from "./security"
import type { Session } from "./workspace-session"

export async function productWritePolicy(
  s: Session,
  product: z.infer<(typeof productReadOperations)["product.show"]["output"]>
) {
  if (s.org.kind !== "buyer") {
    return product
  }
  const accounts = await db().select().from(connections).where(eq(connections.orgId, s.org.id))
  const links = await currentLinks(
    s.org.id,
    product.variants.map((variant) => variant.id)
  )
  return {
    ...product,
    variants: product.variants.map((variant) => {
      const source = variant.source
      const account = accounts.find(
        (account) =>
          account.id === source?.connectionId &&
          account.externalId === source.accountId &&
          account.provider === "shopify"
      )
      if (!source || !account) {
        return variant
      }
      const fields = ["sku", "cost", "price", "inventory"] as const
      return {
        ...variant,
        writePolicy: {
          source,
          connectionRevision: account.revision,
          skuScope: "shopify_only" as const,
          priceAuthority: "shopify" as const,
          costAuthority: "shopify" as const,
          supportedCurrency: "USD" as const,
          preflightRequired: true as const,
          fieldCapabilities: fields.map((field) => {
            const scope = field === "price" ? "write_products" : "write_inventory"
            const writable =
              can(s, "products", "edit") &&
              (field !== "inventory" || can(s, "inventory", "edit")) &&
              (!(field === "cost" || field === "price") || can(s, "prices")) &&
              account.scopes.split(/[ ,]+/).includes(scope)
            return {
              field,
              writable,
              reason: writable
                ? "Preview checks current provider values, scopes and every selected destination."
                : "Current workspace permissions or provider scopes do not allow this field."
            }
          }),
          linkedListings: links
            .filter((link) => link.variantId === variant.id)
            .map((link) => ({
              id: link.id,
              revision: link.revision,
              linkRevision: link.linkRevision,
              piecesPerListing: link.piecesPerListing,
              active:
                link.active &&
                accounts.some((account) => account.id === link.connectionId && account.externalId === link.accountId),
              availabilityLocationId: link.fulfillmentMode === "fbm" ? `listing:${link.id}` : null,
              inventoryOwner: link.inventoryOwner
            }))
        }
      }
    })
  }
}

async function currentLinks(orgId: string, variantIds: string[]) {
  if (!variantIds.length) {
    return []
  }
  return (
    await db()
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
      .where(and(eq(channelListings.orgId, orgId), inArray(channelListings.variantId, variantIds)))
  ).map(({ listing }) => listing)
}

// Only local revisions and routing choices belong in the short enqueue transaction.
export async function writeDependencies(orgId: string, variantId: string) {
  const accounts = await db()
    .select({
      id: connections.id,
      provider: connections.provider,
      accountId: connections.externalId,
      revision: connections.revision,
      inventoryLocations: connections.inventoryLocations
    })
    .from(connections)
    .where(eq(connections.orgId, orgId))
    .orderBy(connections.id)
  const links = await db()
    .select({
      id: channelListings.id,
      revision: channelListings.revision,
      linkRevision: channelListings.linkRevision,
      active: channelListings.active
    })
    .from(channelListings)
    .where(and(eq(channelListings.orgId, orgId), eq(channelListings.variantId, variantId)))
    .orderBy(channelListings.id)
  const locations = await db()
    .select({
      domain: inventoryLocationMappings.shopifyDomain,
      locationId: inventoryLocationMappings.locationId,
      revision: inventoryLocationMappings.revision
    })
    .from(inventoryLocationMappings)
    .where(eq(inventoryLocationMappings.orgId, orgId))
    .orderBy(inventoryLocationMappings.shopifyDomain, inventoryLocationMappings.locationId)
  return hash(canonicalJson({ accounts, links, locations }))
}

export async function targetAccount(
  orgId: string,
  target: Pick<WriteDestination, "connectionId" | "accountId" | "provider" | "connectionRevision">
) {
  const [account] = await db()
    .select()
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.id, target.connectionId)))
  if (
    !account ||
    account.externalId !== target.accountId ||
    account.provider !== target.provider ||
    account.revision !== target.connectionRevision
  ) {
    throw new CliError(
      "dependency_changed",
      "The connected account or its settings changed. Review a new preview.",
      409
    )
  }
  return account
}
export async function observeTarget(orgId: string, target: WriteDestination) {
  const account = await targetAccount(orgId, target)
  if (target.provider === "amazon") {
    const [link] = await db()
      .select()
      .from(channelListings)
      .where(and(eq(channelListings.orgId, orgId), eq(channelListings.id, target.listingId!)))
    if (
      !link ||
      !link.active ||
      link.connectionId !== account.id ||
      link.accountId !== account.externalId ||
      link.linkRevision !== target.linkRevision ||
      link.sellerSku !== target.externalId
    ) {
      throw new CliError("dependency_changed", "The listing link changed. Review a new preview.", 409)
    }
    const current = amazonListingValues(
      await readAmazonListing(await amazonFor(orgId, target.accountId), target.accountId, target.externalId)
    )
    if (current.productType !== target.productType || current.fulfillmentMode !== link.fulfillmentMode) {
      throw new CliError("dependency_changed", "The listing's product type or fulfillment mode changed.", 409)
    }
    if (target.field === "inventory") {
      if (link.inventoryOwner !== "manual" || current.fulfillmentMode !== "fbm") {
        throw new CliError("managed_by_source", "This offer is not manually managed merchant availability.", 409)
      }
      return current.quantity
    }
    if (current.amountMinor === null || current.currency !== "USD") {
      throw new CliError(
        "unsupported_price",
        "The listing has no supported live USD price. No price write was dispatched.",
        409
      )
    }
    return current.amountMinor
  }
  const api = await shopifyFor(orgId, target.accountId)
  const current = await readShopifyWrite(api, target.accountId, target.externalId)
  const required = target.field === "price" ? "write_products" : "write_inventory"
  if (!current.scopes.includes(required)) {
    throw new CliError("provider_scope_missing", `Reconnect Shopify with ${required} before changing this field.`, 409)
  }
  if (current.inventoryItem.id !== target.inventoryItemId || current.product.id !== target.productId) {
    throw new CliError("dependency_changed", "The variant's provider identity changed.", 409)
  }
  if (target.field === "sku") {
    return current.sku
  }
  if (target.field === "cost") {
    return current.costMinor
  }
  if (target.field === "price") {
    return current.amountMinor
  }
  if (!current.inventoryItem.tracked || current.requiresComponents) {
    throw new CliError("unsupported_target", "Only tracked, non-bundle merchant inventory is writable.", 409)
  }
  if (
    !inventoryLocationEnabled(account.inventoryLocations, {
      provider: "shopify",
      accountId: account.externalId,
      scope: "store",
      externalId: target.locationExternalId!
    })
  ) {
    throw new CliError("invalid_location", "This location is excluded from the connection.", 409)
  }
  const [mapping] = await db()
    .select()
    .from(inventoryLocationMappings)
    .where(
      and(
        eq(inventoryLocationMappings.orgId, orgId),
        eq(inventoryLocationMappings.shopifyDomain, account.externalId),
        eq(inventoryLocationMappings.locationId, target.locationExternalId!)
      )
    )
  const configuration = canonicalJson({
    selection: account.inventoryLocations,
    mapping: mapping ? { revision: mapping.revision, classification: mapping.classification } : null
  })
  if (target.configuration && configuration !== target.configuration) {
    throw new CliError("dependency_changed", "Location ownership changed. Review a new preview.", 409)
  }
  let after: string | null = null
  const seen = new Set<string>()
  for (let page = 0; page < 50; page++) {
    const levels = await api.stockLevelsPage(current.inventoryItem.id, after)
    const level = levels.nodes.find((level) => level.location.id === target.locationExternalId)
    if (level) {
      const kind = shopifyLocationKind(level.location)
      // App-managed mirrors and fulfillment services are not made writable by a local classification override.
      if (kind !== "merchant" || (mapping?.classification ?? automaticClassification(kind)) !== "merchant") {
        throw new CliError("managed_by_source", "This location's inventory is managed by another source.", 409)
      }
      const balance = level.quantities.find((row) => row.name === target.quantityState)
      if (!balance) {
        throw new CliError("unavailable_quantity", "The requested quantity state was not returned.", 409)
      }
      target.configuration = configuration
      return balance.quantity
    }
    if (!levels.pageInfo.hasNextPage) {
      break
    }
    const cursor = levels.pageInfo.endCursor
    if (!cursor || seen.has(cursor)) {
      break
    }
    seen.add(cursor)
    after = cursor
  }
  throw new CliError("invalid_location", "This item has no supported balance at the selected location.", 409)
}

export async function resolveWrite(s: Session, input: z.infer<typeof writeIntent>) {
  const variant = (await readProducts(s)).items
    .flatMap((product) => product.variants)
    .find((variant) => variant.id === input.variantId)
  if (!variant?.source || variant.source.provider !== "shopify") {
    throw new CliError("identity_unresolved", "Select a current Shopify variant in this workspace.", 409)
  }
  const source = variant.source
  if (input.expectedConnectionRevision === undefined) {
    if (input.mode !== "preview") {
      throw new CliError("invalid_input", "Direct writes require the current connection revision.")
    }
    const [current] = await db()
      .select({ revision: connections.revision })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.id, source.connectionId)))
    if (!current) {
      throw new CliError("not_found", "Connection not found.", 404)
    }
    input.expectedConnectionRevision = current.revision
  }
  const account = await targetAccount(s.org.id, {
    connectionId: source.connectionId,
    accountId: source.accountId,
    provider: "shopify",
    connectionRevision: input.expectedConnectionRevision
  })
  const observed = await readShopifyWrite(
    await shopifyFor(s.org.id, account.externalId),
    account.externalId,
    source.externalId
  )
  const change = input.change
  if (change.field === "sku" && change.expectedSku === undefined) {
    if (input.mode !== "preview") {
      throw new CliError("invalid_input", "Direct SKU writes require expectedSku.")
    }
    change.expectedSku = observed.sku
  }
  if ((change.field === "price" || change.field === "cost") && change.expectedAmountMinor === undefined) {
    if (input.mode !== "preview") {
      throw new CliError("invalid_input", "Direct money writes require expectedAmountMinor.")
    }
    change.expectedAmountMinor = change.field === "price" ? observed.amountMinor : observed.costMinor
  }
  if (change.field === "inventory" && change.expectedQuantity === undefined && input.mode !== "preview") {
    throw new CliError("invalid_input", "Direct inventory writes require expectedQuantity.")
  }
  let desired: string | number
  let before: string | number | null
  if (change.field === "sku") {
    desired = change.sku
    before = change.expectedSku ?? null
  } else if (change.field === "inventory") {
    desired = change.quantity
    before = change.expectedQuantity ?? null
  } else {
    desired = change.amountMinor
    before = change.expectedAmountMinor ?? null
  }
  const base: WriteDestination = {
    id: input.variantId,
    provider: "shopify",
    accountId: account.externalId,
    connectionId: account.id,
    connectionRevision: account.revision,
    field: change.field,
    role: "source",
    before,
    desired,
    currency: change.field === "cost" || change.field === "price" ? "USD" : null,
    unit: change.field === "inventory" ? "shopify_inventory_unit" : null,
    state: "pending",
    issue: null,
    externalId: source.externalId,
    productId: observed.product.id,
    inventoryItemId: observed.inventoryItem.id,
    locationExternalId: null,
    quantityState: null,
    listingId: null,
    listingRevision: null,
    linkRevision: null,
    productType: null,
    configuration: "",
    lockKey: "",
    submissionId: null,
    attempts: 0
  }
  const linked = await currentLinks(s.org.id, [input.variantId])
  let requiredLinks: typeof linked = []
  if (change.field === "price") {
    requiredLinks = linked
  }
  if (change.field === "inventory") {
    requiredLinks = linked.filter((link) => change.locationId === `listing:${link.id}`)
  }
  if (input.mode === "preview" && !input.expectedLinks.length) {
    input.expectedLinks = requiredLinks.map(({ id, revision, linkRevision }) => ({ id, revision, linkRevision }))
  }
  if (
    new Set(input.expectedLinks.map((link) => link.id)).size !== input.expectedLinks.length ||
    requiredLinks.length !== input.expectedLinks.length ||
    requiredLinks.some(
      (link) =>
        !input.expectedLinks.some(
          (guard) =>
            guard.id === link.id && guard.revision === link.revision && guard.linkRevision === link.linkRevision
        )
    )
  ) {
    throw new CliError(
      "dependency_changed",
      "Supply current observation and link revisions for every selected listing.",
      409
    )
  }
  const targets: WriteDestination[] = []
  if (change.field !== "inventory" || !requiredLinks.length) {
    if (change.field === "inventory") {
      const prefix = scopedReadId(account.id, account.externalId, "")
      if (!change.locationId.startsWith(prefix)) {
        throw new CliError("invalid_location", "Select a supported location for this variant.", 409)
      }
      base.locationExternalId = decodeURIComponent(change.locationId.slice(prefix.length))
      base.quantityState = change.quantityState
      base.id = change.locationId
    }
    targets.push(base)
  }
  if (
    change.field === "price" &&
    (new Set(change.targetPrices.map((price) => price.listingId)).size !== change.targetPrices.length ||
      change.targetPrices.some((price) => !requiredLinks.some((link) => link.id === price.listingId)))
  ) {
    throw new CliError("invalid_input", "Target prices must identify distinct linked listings.")
  }
  for (const link of requiredLinks) {
    if (!link.active || link.marketplaceId !== usMarketplaceId || !link.piecesPerListing) {
      throw new CliError(
        "unsupported_target",
        `Unlink or correct listing ${link.id}: it is inactive or has an unsupported basis.`,
        409
      )
    }
    const [destination] = await db()
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, link.connectionId),
          eq(connections.orgId, s.org.id),
          eq(connections.externalId, link.accountId)
        )
      )
    if (!destination) {
      throw new CliError("dependency_changed", "A linked account changed.", 409)
    }
    let targetAmount = desired
    if (change.field === "price") {
      const price = change.targetPrices.find((price) => price.listingId === link.id)
      if (!price && (link.piecesPerListing !== 1 || observed.requiresComponents)) {
        throw new CliError("price_basis_required", "Supply an explicit price for every non-1:1 linked offer.", 409)
      }
      targetAmount = price?.amountMinor ?? change.amountMinor
    }
    if (change.field === "inventory" && change.quantityState !== "available") {
      throw new CliError(
        "invalid_state",
        "Amazon merchant offers expose availability, not physical on-hand stock.",
        409
      )
    }
    if (change.field === "inventory" && change.quantity < 0) {
      throw new CliError("invalid_quantity", "Amazon offer availability cannot be negative.")
    }
    targets.push({
      ...base,
      id: link.id,
      provider: "amazon",
      accountId: link.accountId,
      connectionId: link.connectionId,
      connectionRevision: destination.revision,
      role: change.field === "inventory" ? "source" : "target",
      externalId: link.sellerSku,
      productId: null,
      inventoryItemId: null,
      listingId: link.id,
      listingRevision: link.revision,
      linkRevision: link.linkRevision,
      productType: link.productType,
      desired: targetAmount,
      before: change.field === "inventory" ? (change.expectedQuantity ?? null) : link.amountMinor,
      quantityState: change.field === "inventory" ? "available" : null,
      unit: change.field === "inventory" ? "amazon_sellable_unit" : null
    })
  }
  for (const target of targets) {
    target.lockKey = hash(
      canonicalJson([target.provider, target.accountId, target.externalId, target.field, target.locationExternalId])
    )
    const current = await observeTarget(s.org.id, target)
    if (change.field === "inventory" && change.expectedQuantity === undefined && input.mode === "preview") {
      if (typeof current !== "number") {
        throw new CliError("unavailable_quantity", "Current availability is unknown.", 409)
      }
      change.expectedQuantity = current
      target.before = current
    }
    if (current !== target.before) {
      throw new CliError("revision_conflict", "A provider value changed. Read current values and review again.", 409)
    }
  }
  return targets
}
