import { randomUUID } from "node:crypto"
import type { OrderInput } from "@repo/copacker-shipments"
import { beforeAll, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/workspace-session"

vi.mock("@/db", () => import("./test-db"))

import { forwarderOrder, forwarderOrders } from "../src/server/access"
import { database, setUpTestDatabase } from "./test-db"
import { testSession } from "./test-session"

const actor = (kind: Session["org"]["kind"], id: string) => testSession({ orgId: id, kind, name: "Test org" })

describe("a forwarder's purchase orders", () => {
  const yiwu = randomUUID(),
    other = randomUUID(),
    club = randomUUID(),
    shop = randomUUID()
  const forwarder = actor("forwarder", yiwu)
  // Each PO's id, by what it is.
  const ids: Record<string, string> = {}

  setUpTestDatabase()
  beforeAll(async () => {
    await database.insert(tables.organizations).values([
      { id: yiwu, name: "Yiwu Logistics", kind: "forwarder" },
      { id: other, name: "Bayline Freight", kind: "forwarder" },
      { id: club, name: "Fencing Club", kind: "buyer" },
      { id: shop, name: "Blade Shop", kind: "buyer" }
    ])
    // Yiwu joined as the forwarder of two buyers; the club also uses another forwarder, and one it removed.
    const added = await database
      .insert(tables.forwarders)
      .values([
        { buyerOrgId: club, forwarderOrgId: yiwu, name: "Yiwu Logistics" },
        { buyerOrgId: shop, forwarderOrgId: yiwu, name: "Yiwu (Blade Shop)" },
        { buyerOrgId: club, forwarderOrgId: other, name: "Bayline Freight" },
        { buyerOrgId: club, forwarderOrgId: yiwu, name: "Yiwu, removed", removedAt: new Date() }
      ])
      .returning()
    const [clubYiwu, shopYiwu, clubOther, removed] = added.map((row) => row.id)
    const suppliers = await database
      .insert(tables.suppliers)
      .values([
        { buyerOrgId: club, name: "Ok Fencing", email: "ok@example.com" },
        { buyerOrgId: shop, name: "Blade Co", email: "blade@example.com" }
      ])
      .returning()
    const supplierOf = { [club]: suppliers[0]!.id, [shop]: suppliers[1]!.id }
    const po = (
      name: string,
      buyerOrgId: string,
      status: "draft" | "submitted" | "closed",
      forwarderId: string | undefined,
      createdAt: string
    ) => {
      const data: Partial<OrderInput> = {
        reference: name,
        currency: "USD",
        items: [],
        adjustments: [],
        ...(forwarderId ? { via: { forwarderId, addressId: randomUUID() } } : {})
      }
      const id = randomUUID()
      ids[name] = id
      return {
        id,
        buyerOrgId,
        supplierId: supplierOf[buyerOrgId]!,
        shopifyDomain: "club.myshopify.com",
        status,
        data: data as OrderInput,
        createdAt: new Date(createdAt)
      }
    }
    await database.insert(tables.orders).values([
      po("shop closed", shop, "closed", shopYiwu, "2026-09-02T00:00:00Z"),
      po("club sent", club, "submitted", clubYiwu, "2026-09-01T00:00:00Z"),
      po("club draft", club, "draft", clubYiwu, "2026-09-03T00:00:00Z"),
      po("club direct", club, "submitted", undefined, "2026-09-04T00:00:00Z"),
      po("club other forwarder", club, "submitted", clubOther, "2026-09-05T00:00:00Z"),
      po("club removed forwarder", club, "submitted", removed, "2026-09-06T00:00:00Z"),
      // Naming another buyer's forwarder doesn't route the club's PO through it.
      po("club naming the shop's", club, "submitted", shopYiwu, "2026-09-07T00:00:00Z")
    ])
  })

  it("lists the sent POs passing through a forwarder it joined as, oldest first", async () => {
    expect(
      (await forwarderOrders(forwarder)).map((row) => [row.order.data.reference, row.forwarder.name, row.supplier.name])
    ).toEqual([
      ["club sent", "Yiwu Logistics", "Ok Fencing"],
      ["shop closed", "Yiwu (Blade Shop)", "Blade Co"]
    ])
    expect(await forwarderOrders(actor("forwarder", other))).toMatchObject([
      { order: { id: ids["club other forwarder"] }, forwarder: { name: "Bayline Freight", buyerOrgId: club } }
    ])
    expect(await forwarderOrders(actor("buyer", club))).toEqual([])
  })

  it("opens one of them by id, and nothing else", async () => {
    expect(await forwarderOrder(forwarder, ids["club sent"]!)).toMatchObject({
      order: { id: ids["club sent"] },
      supplier: { name: "Ok Fencing" },
      forwarder: { name: "Yiwu Logistics", buyerOrgId: club }
    })
    for (const name of [
      "club draft",
      "club direct",
      "club other forwarder",
      "club removed forwarder",
      "club naming the shop's"
    ]) {
      await expect(forwarderOrder(forwarder, ids[name]!)).rejects.toThrow("not found")
    }
    await expect(forwarderOrder(forwarder, "abc")).rejects.toThrow("not found")
    await expect(forwarderOrder(forwarder, randomUUID())).rejects.toThrow("not found")
    await expect(forwarderOrder(actor("buyer", club), ids["club sent"]!)).rejects.toThrow("not found")
  })
})
