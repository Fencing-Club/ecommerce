import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  connections,
  inventoryLocationMappings,
  organizations,
  stockSnapshots,
  variantStockTargetSets
} from "../src/db/schema"
import { connectionInventory, updateConnectionInventory } from "../src/server/operation-connections"
import { readVariantFields, saveVariantFields } from "../src/server/product-fields"
import { restockAllChannels, restockChannels, restockReport } from "../src/server/restock-page"
import {
  listLocationGroups,
  preserveImportedStockTargets,
  readStockTargets,
  removeLocationGroup,
  saveLocationGroup,
  saveStockTargets
} from "../src/server/stock-targets"
import { database, setUpTestDatabase } from "./test-db"
import { testSession } from "./test-session"

vi.mock("@/db", () => import("./test-db"))
vi.mock("../src/server/sales-orders", () => ({
  restockDemand: async () => ({ shopifySales: { rows: [], gaps: [] }, amazonSales: null, ebaySales: null, sources: [] })
}))
setUpTestDatabase({ truncate: true })
const orgId = randomUUID()
const s = testSession({ orgId, kind: "buyer" })
const accountId = "shop.myshopify.com"
const variantId = "gid://shopify/ProductVariant/1"
const first = { provider: "shopify", accountId, scope: "store", externalId: "gid://shopify/Location/1" }
const second = { ...first, externalId: "gid://shopify/Location/2" }
const selection = { accountId, variantId }
const target = (location = first) => ({
  id: randomUUID(),
  quantity: 100,
  destination: { kind: "location" as const, location }
})

beforeEach(async () => {
  await database.insert(organizations).values({ id: orgId, name: "Buyer", kind: "buyer" })
  await database
    .insert(connections)
    .values({ orgId, provider: "shopify", externalId: accountId, encryptedToken: "private" })
  await database.insert(stockSnapshots).values({
    orgId,
    source: "shopify",
    externalAccountId: accountId,
    scopeKey: "store",
    data: {
      source: "shopify",
      shopifyDomain: accountId,
      scopeKey: "store",
      startedAt: "2026-10-01T00:00:00Z",
      observedAt: "2026-10-01T00:00:00Z",
      rows: [
        {
          variantId,
          productId: "gid://shopify/Product/1",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          buyerSku: "SKU",
          productTitle: "Product",
          supplierName: "Outside supplier",
          variantTitle: "Default Title",
          imageUrl: null,
          tracked: true,
          unit: "shopify_inventory_unit",
          levels: [first, second].map((ref) => ({
            locationId: ref.externalId,
            locationName: ref.externalId,
            locationKind: "merchant",
            available: 10,
            onHand: 10,
            incoming: 0,
            committed: 0
          }))
        }
      ]
    }
  })
})

describe("stock target settings", () => {
  it("stores a pool on the target and preserves its membership through the existing product field API", async () => {
    const value = { id: randomUUID(), quantity: 100, destination: { kind: "pool", locations: [first, second] } }
    await saveStockTargets(s, { ...selection, expectedRevision: 0, targets: [value] })
    expect((await readVariantFields(orgId, accountId)).get(variantId)?.storeStockTarget).toBe(100)
    await saveVariantFields(s, { variantId, supplierSku: "EDIT", storeStockTarget: 100, amazonStockTarget: null })
    expect((await readStockTargets(s, selection)).revision).toBe(1)
    await saveVariantFields(s, { variantId, storeStockTarget: 125 })
    expect((await readStockTargets(s, selection)).targets).toEqual([{ ...value, quantity: 125 }])
    expect((await readStockTargets(s, selection)).revision).toBe(2)
  })

  it("keeps independent variation targets and does not collapse them through a scalar form", async () => {
    const values = [target(first), target(second)]
    await saveStockTargets(s, { ...selection, expectedRevision: 0, targets: values })
    expect((await readVariantFields(orgId, accountId)).get(variantId)?.storeStockTarget).toBeNull()
    await saveVariantFields(s, { variantId, supplierSku: "EDIT", storeStockTarget: null })
    expect((await readStockTargets(s, selection)).targets).toEqual(values)
    await expect(saveVariantFields(s, { variantId, storeStockTarget: 50 })).rejects.toMatchObject({ status: 409 })
  })

  it("edits independent target quantities from the existing product form with revision protection", async () => {
    const values = [target(first), target(second)]
    await saveStockTargets(s, { ...selection, expectedRevision: 0, targets: values })
    const changed = values.map((value, index) => ({ ...value, quantity: index ? 55 : 125 }))
    await saveVariantFields(s, { variantId, stockTargets: { revision: 1, targets: changed }, supplierSku: "EDIT" })
    expect((await readStockTargets(s, selection)).targets).toEqual(changed)
    await expect(
      saveVariantFields(s, { variantId, stockTargets: { revision: 1, targets: values } })
    ).rejects.toMatchObject({ status: 409 })
    expect((await readStockTargets(s, selection)).targets).toEqual(changed)
  })

  it("uses a pooled target through the existing app selector and report without duplicate physical recommendations", async () => {
    await saveStockTargets(s, {
      ...selection,
      expectedRevision: 0,
      targets: [{ id: randomUUID(), quantity: 100, destination: { kind: "pool", locations: [first, second] } }]
    })
    const third = { ...first, externalId: "gid://shopify/Location/3" }
    const [snapshot] = await database.select().from(stockSnapshots)
    if (snapshot?.data?.source !== "shopify") {
      throw new Error("Expected catalog")
    }
    await database
      .update(stockSnapshots)
      .set({
        data: {
          ...snapshot.data,
          rows: snapshot.data.rows.map((row) => ({
            ...row,
            levels: [
              ...row.levels,
              { ...row.levels[0]!, locationId: third.externalId, locationName: "Third warehouse", available: 300 }
            ]
          }))
        }
      })
      .where(eq(stockSnapshots.id, snapshot.id))
    const saved = await readStockTargets(s, selection)
    await saveStockTargets(s, {
      ...selection,
      expectedRevision: saved.revision,
      targets: [...saved.targets, { ...target(third), quantity: 350 }]
    })
    const options = await restockChannels(orgId)
    const pool = options.find((option) => option.channel.kind === "pool")!
    expect(pool.label).toContain(" + ")
    const report = await restockReport(s, { days: 30, leadTimeDays: 45, channel: pool.channel })
    expect(report.lines).toHaveLength(1)
    expect(report.lines[0]).toMatchObject({ targetStock: 100, available: 20, purchaseUnits: 80 })
    const all = await restockAllChannels(orgId, 30, 45)
    const allLines = all.channels.flatMap((channel) => channel.lines)
    expect(allLines).toHaveLength(2)
    expect(allLines.map((line) => line.purchaseUnits).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([50, 80])
    expect(allLines.reduce((sum, line) => sum + (line.available ?? 0), 0)).toBe(320)
    // The server resolves the selected identity; supplied members cannot change the pool.
    if (pool.channel.kind !== "pool") {
      throw new Error("Expected pool channel")
    }
    {
      const tampered = await restockReport(s, {
        days: 30,
        leadTimeDays: 45,
        channel: { ...pool.channel, members: [first] }
      })
      expect(tampered.lines).toEqual(report.lines)
    }
  })

  it("configures connection availability independently of target membership with revision and admin checks", async () => {
    const [account] = await database.select().from(connections)
    const id = account!.id
    await saveStockTargets(s, { ...selection, expectedRevision: 0, targets: [target(first)] })
    const before = await connectionInventory(s, id)
    const saved = await updateConnectionInventory(s, { id, expectedRevision: before.revision, locations: [second] })
    expect(saved.locations.map((location) => location.enabled)).toEqual([false, true])
    expect(saved.revision).toBe(before.revision + 1)
    expect((await readStockTargets(s, selection)).issues[0]?.code).toBe("ineligible_location")
    await expect(
      updateConnectionInventory(s, { id, expectedRevision: before.revision, locations: [] })
    ).rejects.toMatchObject({ code: "revision_conflict" })
    await expect(
      updateConnectionInventory(s, {
        id,
        expectedRevision: saved.revision,
        locations: [{ ...first, accountId: "other" }]
      })
    ).rejects.toMatchObject({ code: "invalid_location" })
    await expect(
      connectionInventory(testSession({ orgId, kind: "buyer", role: "member", access: { products: "edit" } }), id)
    ).rejects.toMatchObject({ status: 403 })
    expect((await readStockTargets(s, selection)).targets[0]?.destination).toEqual({
      kind: "location",
      location: first
    })
  })
  it("discovers independent locations without inventing targets and saves a variant buffer", async () => {
    const before = await readStockTargets(s, selection)
    expect(before.locations).toHaveLength(2)
    expect(before.targets).toEqual([])
    const value = target()
    const saved = await saveStockTargets(s, { ...selection, expectedRevision: 0, targets: [value] })
    expect(saved.targets).toEqual([value])
    expect(saved.revision).toBe(1)
    await expect(saveStockTargets(s, { ...selection, expectedRevision: 0, targets: [] })).rejects.toMatchObject({
      code: "revision_conflict"
    })
  })

  it("rejects overlapping group edits across variants and prevents deleting assigned groups", async () => {
    const group = await saveLocationGroup(s, {
      id: randomUUID(),
      name: "Warehouse group",
      locations: [first],
      expectedRevision: 0
    })
    await saveStockTargets(s, {
      ...selection,
      expectedRevision: 0,
      targets: [{ id: randomUUID(), quantity: 40, destination: { kind: "group", groupId: group.id } }, target(second)]
    })
    await expect(
      saveLocationGroup(s, { id: group.id, name: group.name, locations: [first, second], expectedRevision: 1 })
    ).rejects.toMatchObject({ code: "target_overlap" })
    expect((await listLocationGroups(s)).items[0]?.revision).toBe(1)
    await expect(removeLocationGroup(s, { id: group.id, expectedRevision: 1 })).rejects.toMatchObject({
      code: "group_in_use"
    })
    await saveStockTargets(s, { ...selection, expectedRevision: 1, targets: [] })
    await removeLocationGroup(s, { id: group.id, expectedRevision: 1 })
    expect((await listLocationGroups(s)).items).toEqual([])
  })

  it("rejects foreign accounts, missing variants, unavailable pools and mirror classifications", async () => {
    await expect(readStockTargets(s, { ...selection, accountId: "other" })).rejects.toMatchObject({
      code: "source_changed"
    })
    await expect(
      readStockTargets(s, { ...selection, variantId: "gid://shopify/ProductVariant/2" })
    ).rejects.toMatchObject({ code: "source_changed" })
    await database
      .insert(inventoryLocationMappings)
      .values({ orgId, shopifyDomain: accountId, locationId: first.externalId, classification: "amazon_mirror" })
    await expect(saveStockTargets(s, { ...selection, expectedRevision: 0, targets: [target()] })).rejects.toMatchObject(
      { code: "invalid_target" }
    )
    await database
      .insert(connections)
      .values({ orgId, provider: "amazon", externalId: "seller", encryptedToken: "private" })
    expect(
      (await listLocationGroups(s)).locations
        .filter((location) => location.ref.provider === "amazon")
        .map((location) => location.available)
    ).toEqual([false, false])
  })

  it("preserves imported zero and store quantities until explicitly resolved, without overwriting edits", async () => {
    await preserveImportedStockTargets(orgId, accountId, [{ variantId, amazonStockTarget: 0, storeStockTarget: 50 }])
    const before = await readStockTargets(s, selection)
    expect(before.unassigned).toEqual([
      { source: "amazon", quantity: 0 },
      { source: "store", quantity: 50 }
    ])
    await saveStockTargets(s, { ...selection, expectedRevision: 1, targets: [target()] })
    expect((await readStockTargets(s, selection)).unassigned).toEqual(before.unassigned)
    await saveStockTargets(s, { ...selection, expectedRevision: 2, targets: [target()], resolveImported: true })
    await preserveImportedStockTargets(orgId, accountId, [{ variantId, amazonStockTarget: 300, storeStockTarget: 200 }])
    const after = await readStockTargets(s, selection)
    expect(after.unassigned).toEqual([])
    expect(after.targets[0]?.quantity).toBe(100)
    expect(after.revision).toBe(3)
  })

  it("scopes settings to the workspace and requires product edit permission", async () => {
    const viewer = testSession({ orgId, kind: "buyer", role: "member", access: { products: "view" } })
    expect((await readStockTargets(viewer, selection)).revision).toBe(0)
    await expect(saveStockTargets(viewer, { ...selection, expectedRevision: 0, targets: [] })).rejects.toMatchObject({
      status: 403
    })
    const foreign = testSession({ orgId: randomUUID(), kind: "buyer" })
    expect((await listLocationGroups(foreign)).items).toEqual([])
    await expect(readStockTargets(foreign, selection)).rejects.toMatchObject({ code: "source_changed" })
  })

  it("reports a previously valid target as ineligible after a reconnect rather than moving it", async () => {
    await saveStockTargets(s, { ...selection, expectedRevision: 0, targets: [target()] })
    await database.update(connections).set({ externalId: "replacement" }).where(eq(connections.orgId, orgId))
    await expect(readStockTargets(s, selection)).rejects.toMatchObject({ code: "source_changed" })
    const [saved] = await database.select().from(variantStockTargetSets)
    expect(saved?.shopifyDomain).toBe(accountId)
  })
})
