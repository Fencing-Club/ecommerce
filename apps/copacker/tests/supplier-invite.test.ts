import { randomUUID } from "node:crypto"
import { eq, like } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

vi.mock("../src/server/connections", () => ({
  amazonFor: vi.fn<() => void>(),
  shopifyFor: vi.fn<() => void>(),
  connection: vi.fn<() => void>()
}))
vi.mock("../src/server/auth", async (original) => (await import("./test-session")).mockAuth(original))
vi.mock("@/db", () => import("./test-db"))

import { POST as postAction } from "../src/server/http/api/action"
import { appUrl, hash } from "../src/server/security"
import { served } from "./served"
import { database, setUpTestDatabase } from "./test-db"
import { signedIn, testSession } from "./test-session"

// The action route as Start serves it, through the HTTP boundary that answers its failures.
const action = served(postAction)

const buyerId = randomUUID(),
  otherBuyerId = randomUUID(),
  supplierOrgId = randomUUID(),
  pendingId = randomUUID(),
  joinedId = randomUUID()

const actor = (id: string) => testSession({ orgId: id, kind: "buyer", name: "Fencing Club" })

const resend = async (id: string) =>
  action(
    new Request("http://localhost/api/action", {
      method: "POST",
      headers: { origin: appUrl() },
      body: JSON.stringify({ action: "supplier.resend", data: { id } })
    })
  )

setUpTestDatabase({ truncate: [tables.organizations, tables.jobs] })
beforeEach(async () => {
  signedIn.actor = actor(buyerId)
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Fencing Club", kind: "buyer" },
    { id: otherBuyerId, name: "Other buyer", kind: "buyer" },
    { id: supplierOrgId, name: "Joined supplier", kind: "supplier" }
  ])
  await database.insert(tables.suppliers).values([
    {
      id: pendingId,
      buyerOrgId: buyerId,
      name: "Test Supplier",
      email: "supplier@example.com",
      invitationHash: hash("original-invitation-token"),
      expiresAt: new Date(Date.now() - 86400000)
    },
    { id: joinedId, buyerOrgId: buyerId, supplierOrgId, name: "Joined", email: "joined@example.com" }
  ])
  await database.insert(tables.jobs).values({
    key: `invite:${pendingId}`,
    kind: "email",
    status: "complete",
    payload: {
      type: "invite",
      to: "supplier@example.com",
      name: "Fencing Club",
      invitation: "original-invitation-token"
    }
  })
})

describe("supplier.resend", () => {
  it("issues a new invitation and queues the email again", async () => {
    const response = await resend(pendingId)
    expect(response.status).toBe(200)

    const [supplier] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, pendingId))
    const [job] = await database
      .select()
      .from(tables.jobs)
      .where(like(tables.jobs.key, `invite:${pendingId}:%`))
    const invitation = String(job?.payload.invitation)

    expect(job).toMatchObject({
      status: "pending",
      attempts: 0,
      payload: { type: "invite", to: "supplier@example.com" }
    })
    expect(invitation).not.toBe("original-invitation-token")
    expect(supplier?.invitationHash).toBe(hash(invitation))
    expect(supplier?.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 6 * 86400000)
  })

  it("refuses a supplier that has already joined", async () => {
    const response = await resend(joinedId)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(
      await database
        .select()
        .from(tables.jobs)
        .where(like(tables.jobs.key, `invite:${joinedId}%`))
    ).toEqual([])
  })

  it("refuses another buyer's supplier", async () => {
    signedIn.actor = actor(otherBuyerId)
    const response = await resend(pendingId)
    expect(response.status).toBeGreaterThanOrEqual(400)
    const [supplier] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, pendingId))
    expect(supplier?.invitationHash).toBe(hash("original-invitation-token"))
  })
})
