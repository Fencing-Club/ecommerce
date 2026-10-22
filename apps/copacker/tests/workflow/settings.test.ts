import { purchaseOrderPdf } from "@repo/copacker-shipments/documents"
import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { generatePo } from "../../src/server/documents"
import { POST as postAction } from "../../src/server/http/api/action"
import { ownProfile, saveProfile } from "../../src/server/profile"
import { restockDefaults, restockSettings } from "../../src/server/restock-report"
import { profileFor } from "../../src/server/workspace-session"
import { served } from "../served"
import { database } from "../test-db"
import { buyer, buyerId, orderId, setUpWorkflowTests, supplier } from "./fixtures"

// The action route as Start serves it, through the HTTP boundary that answers its failures.
const action = served(postAction)

vi.mock("../../src/server/connections", async () => (await import("../mocks/providers")).connectionsModule())
vi.mock("../../src/server/product-fields", async (original) =>
  (await import("../mocks/providers")).productFieldsModule(original)
)
vi.mock("../../src/server/storage", async (original) => (await import("../mocks/providers")).storageModule(original))
vi.mock("@repo/copacker-shipments/documents", async (original) =>
  (await import("../mocks/providers")).documentsModule(original)
)
vi.mock("@repo/copacker-shipments/product-labels", async (original) =>
  (await import("../mocks/providers")).productLabelsModule(original)
)
vi.mock("../../src/server/auth", async (original) => (await import("../test-session")).mockAuth(original))
vi.mock("@/db", () => import("../test-db"))
vi.mock("../../src/server/import-trace", async (original) =>
  (await import("../mocks/providers")).importTraceModule(original)
)
vi.mock("../../src/server/readiness", async (original) =>
  (await import("../mocks/providers")).readinessModule(original)
)

setUpWorkflowTests()

describe("profiles", () => {
  it("keeps the name someone signed up with, and asks for one when there's none", async () => {
    expect(await profileFor({ id: "user-a", firstName: " Ada ", lastName: "Lovelace" })).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace"
    })
    // Their saved name wins over a later sign-in's.
    expect(await profileFor({ id: "user-a", firstName: "Other", lastName: "Name" })).toMatchObject({ firstName: "Ada" })
    expect(await profileFor({ id: "user-b", firstName: "Grace", lastName: null })).toBeNull()
    // A name from sign-in still needs a position and company.
    expect((await ownProfile("user-a")).complete).toBe(false)
  })

  it("saves a person's own name, trimmed", async () => {
    const profile = { firstName: " Tess ", lastName: "Tester ", position: "Buyer", company: "Fencing Club" }
    expect((await ownProfile(buyer.user.id)).complete).toBe(false)
    await saveProfile(buyer, profile)
    await saveProfile(buyer, { ...profile, firstName: "Tessa" })
    expect(await database.select().from(tables.profiles)).toMatchObject([
      { userId: buyer.user.id, firstName: "Tessa", lastName: "Tester", position: "Buyer", company: "Fencing Club" }
    ])
    expect((await ownProfile(buyer.user.id)).complete).toBe(true)
    await expect(saveProfile(buyer, { ...profile, position: " " })).rejects.toThrow("onboarding.person.choosePosition")
  })
})

describe("the workspace website on POs", () => {
  it("lets the buyer's owner set the website with their profile, and prints it on the PO", async () => {
    const profile = { firstName: "Tess", lastName: "Tester", position: "Owner", company: "Buyer" }
    // A website typed without https:// is read as https.
    await expect(saveProfile(buyer, { ...profile, website: "ftp://buyer.example" })).rejects.toThrow(
      "onboarding.company.enterWebsite"
    )
    await saveProfile(buyer, { ...profile, website: "buyer.example" })
    const [saved] = await database
      .select()
      .from(tables.supplierProfiles)
      .where(eq(tables.supplierProfiles.orgId, buyerId))
    expect(saved).toMatchObject({ website: "https://buyer.example" })
    await generatePo(orderId)
    expect(vi.mocked(purchaseOrderPdf).mock.lastCall![0].buyer).toMatchObject({ website: "https://buyer.example" })

    await expect(saveProfile(supplier, { ...profile, website: "https://supplier.example" })).rejects.toThrow(
      "Only admins can change the website"
    )
    await expect(
      saveProfile({ ...buyer, role: "member" }, { ...profile, website: "https://buyer.example" })
    ).rejects.toThrow("Only admins can change the website")
  })
})

describe("store time zone", () => {
  const save = (timeZone: string) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "workspace.timeZone", data: { timeZone } })
      })
    )

  it("saves a time zone the runtime knows for the workspace", async () => {
    expect((await save("America/Los_Angeles")).status).toBe(200)
    const [org] = await database
      .select({ timeZone: tables.organizations.timeZone })
      .from(tables.organizations)
      .where(eq(tables.organizations.id, buyerId))
    expect(org?.timeZone).toBe("America/Los_Angeles")
    expect((await save("Mars/Olympus")).status).toBe(400)
  })
})

describe("restock settings", () => {
  const save = (data: Record<string, unknown>) =>
    action(
      new Request("http://localhost:3000/api/action", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ action: "workspace.restock", data })
      })
    )
  const settings = async () => {
    const [org] = await database.select().from(tables.organizations).where(eq(tables.organizations.id, buyerId))
    return restockSettings(org!)
  }

  it("starts from the defaults and keeps the workspace's own sales period and lead time", async () => {
    expect(await settings()).toEqual(restockDefaults)
    expect((await save({ salesDays: 90, leadTimeDays: 45 })).status).toBe(200)
    expect(await settings()).toEqual({ days: 90, leadTimeDays: 45 })
    expect((await save({ salesDays: 0, leadTimeDays: 45 })).status).toBe(400)
  })
})
