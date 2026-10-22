// Prepares a database for the Playwright suite (e2e/). The test account owns a buyer, a supplier and a forwarder
// workspace: the buyer has the demo store, the supplier and forwarder joined as its partners, a supplier that isn't on
// Copacker, and draft purchase orders for the specs to send. Every run starts the workspaces over, keeping their ids so
// signed-in browsers stay in them. Refuses to run against anything but a local or staging database.
// Usage: pnpm db:seed:e2e (needs WORKOS_API_KEY for the environment the app signs in with).
import { randomUUID } from "node:crypto"
import type { Address, OrderInput } from "@repo/copacker-shipments"
import { and, eq } from "drizzle-orm"
import { db } from "../src/db/index"
import {
  contacts,
  forwarders,
  memberships,
  orderRevisions,
  orders,
  organizations,
  profiles,
  supplierProfiles,
  suppliers
} from "../src/db/schema"
import { contactKindsFor } from "../src/lib/contacts"
import { deleteFile } from "../src/server/storage"
import { deleteWorkspaceRecords } from "../src/server/workspace-records"
import { requireDemoDatabase, seedDemoStore } from "./demo-store"
import { e2eUser, e2eWorkos } from "./e2e-user"

requireDemoDatabase()
const user = await e2eUser()

const address = (name: string): Address => ({
  name,
  addressLine1: "100 Test Street",
  addressLine2: "",
  city: "Seattle",
  stateOrRegion: "WA",
  postalCode: "98101",
  countryCode: "US",
  phoneNumber: "+1 206 555 0100",
  email: ""
})

// Starts every workspace the test account owns over, and returns their ids by name.
async function clear() {
  const owned = await db()
    .select({ id: organizations.id, name: organizations.name, workosId: organizations.workosId })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.orgId, organizations.id))
    .where(and(eq(memberships.userId, user.id), eq(memberships.role, "owner")))
  for (const org of owned) {
    // The demo store's token is fake, so the store isn't told the way deleting a workspace in Settings does.
    const files = await db().transaction((tx) => deleteWorkspaceRecords(tx, org.id))
    for (const key of files) {
      await deleteFile(key).catch(() => undefined)
    }
    if (org.workosId) {
      await e2eWorkos().organizations.deleteOrganization(org.workosId)
    }
  }
  return new Map(owned.map((org) => [org.name, org.id]))
}

async function workspace(name: string, kind: "buyer" | "supplier" | "forwarder", ids: Map<string, string>) {
  return db().transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ id: ids.get(name) ?? randomUUID(), name, kind })
      .returning({ id: organizations.id, name: organizations.name })
    await tx.insert(memberships).values({ orgId: org!.id, userId: user.id, email: user.email, role: "owner" })
    await tx.insert(supplierProfiles).values({
      orgId: org!.id,
      phoneNumber: "+1 206 555 0100",
      ...(kind === "supplier" && { contactName: "Casey Tester", contactEmail: user.email })
    })
    const [contact] = await tx
      .insert(contacts)
      .values({ orgId: org!.id, kind: contactKindsFor(kind)[0]!, name: `${name} address`, address: address(name) })
      .returning({ id: contacts.id })
    return { ...org!, addressId: contact!.id }
  })
}

const ids = await clear()
const profile = { firstName: "Casey", lastName: "Tester", position: "Operations manager", company: "E2E Buyer" }
await db()
  .insert(profiles)
  .values({ userId: user.id, ...profile })
  .onConflictDoUpdate({ target: profiles.userId, set: profile })
const buyer = await workspace("E2E Buyer", "buyer", ids)
const supplier = await workspace("E2E Supplier", "supplier", ids)
const forwarder = await workspace("E2E Forwarder", "forwarder", ids)

if (!(await seedDemoStore(buyer))) {
  throw new Error("The E2E buyer workspace is connected to a real store")
}
// The demo store's supplier is the test account's supplier workspace, so purchase orders sent to it reach it.
const [demoSupplier] = await db()
  .update(suppliers)
  .set({ supplierOrgId: supplier.id, email: user.email })
  .where(and(eq(suppliers.buyerOrgId, buyer.id), eq(suppliers.name, "Demo supplier")))
  .returning({ id: suppliers.id })
const [offlineSupplier] = await db()
  .insert(suppliers)
  .values({ buyerOrgId: buyer.id, name: "Offline supplier", contactName: "Sam Offline" })
  .returning({ id: suppliers.id })
const [joinedForwarder] = await db()
  .insert(forwarders)
  .values({ buyerOrgId: buyer.id, forwarderOrgId: forwarder.id, name: "E2E Forwarder", email: user.email })
  .returning({ id: forwarders.id })

// Drafts the specs send and work through, one per scenario so specs running in parallel never share one.
const item = (variant: 1 | 2, pieces: number): OrderInput["items"][number] => ({
  id: randomUUID(),
  variantId: `gid://shopify/ProductVariant/${variant}`,
  inventoryItemId: `gid://shopify/InventoryItem/${variant}`,
  name: "Pro-grip glove",
  variant: variant === 1 ? "Left" : "Right",
  buyerSku: variant === 1 ? "grip-left" : "grip-right",
  supplierSku: variant === 1 ? "GRIP-L" : "GRIP-R",
  asin: "",
  fnsku: "",
  pieces,
  piecesPerSet: 1,
  unitPrice: 850,
  instructions: "",
  prepCategory: "POLYBAGGING",
  suffocationWarning: false,
  receiver: "warehouse"
})
const drafts = [
  { reference: "E2E-DRAFT", supplierId: demoSupplier!.id },
  { reference: "E2E-DELETE", supplierId: demoSupplier!.id },
  { reference: "E2E-CLOSE", supplierId: demoSupplier!.id },
  { reference: "E2E-REVISE", supplierId: demoSupplier!.id },
  { reference: "E2E-FULFILL", supplierId: demoSupplier!.id, via: true },
  { reference: "E2E-OFFLINE", supplierId: offlineSupplier!.id }
]
for (const draft of drafts) {
  const data: OrderInput = {
    supplierId: draft.supplierId,
    reference: draft.reference,
    deliveryId: buyer.addressId,
    ...(draft.via && { via: { forwarderId: joinedForwarder!.id, addressId: forwarder.addressId } }),
    currency: "USD",
    dueDate: "2027-01-15",
    paymentTerms: "Net 30",
    notes: "",
    adjustments: [],
    items: [item(1, 100), item(2, 50)]
  }
  const [order] = await db()
    .insert(orders)
    .values({ buyerOrgId: buyer.id, supplierId: draft.supplierId, shopifyDomain: "copacker-demo.myshopify.com", data })
    .returning({ id: orders.id })
  await db().insert(orderRevisions).values({ orderId: order!.id, revision: 1, data, actor: user.id, reason: "created" })
}
process.stdout.write(`Seeded ${buyer.name}, ${supplier.name} and ${forwarder.name} for ${user.email}\n`)
process.exit(0)
