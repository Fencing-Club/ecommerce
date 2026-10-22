import { describe, expect, it, vi } from "vitest"
vi.mock("../src/server/auth", async (original) => (await import("./test-session")).mockAuth(original))
vi.mock("@/db", () => ({ db: () => null }))

import { type Access, can, canOpen, effectiveAccess, pageOf, type Role } from "../src/lib/access"
import { areasFor, homeFor, navigationFor } from "../src/lib/navigation"
import { POST as postAction } from "../src/server/http/api/action"
import { GET as purchaseOrderPdf } from "../src/server/http/api/orders/$id/po"
import { GET as salesOrders } from "../src/server/http/api/sales/orders"
import { served } from "./served"
import { signedIn, testSession } from "./test-session"

// The action route as Start serves it, through the HTTP boundary that answers its failures.
const action = served(postAction)

const actor = (kind: "buyer" | "supplier" | "forwarder", role: Role, access: Access = {}) =>
  testSession({ orgId: "00000000-0000-4000-8000-000000000001", kind, name: "Test org", role, access })

function send(name: string, data: Record<string, unknown>) {
  return action(
    new Request("http://localhost:3000/api/action", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ action: name, data })
    })
  )
}

describe("page access", () => {
  it("gives owners and admins every page, and members only theirs", () => {
    const member = { role: "member" as const, access: { orders: "edit", shipments: "view" } as const }
    expect(can({ role: "owner", access: {} }, "partners", "edit")).toBe(true)
    expect(can({ role: "admin", access: {} }, "catalogs", "edit")).toBe(true)
    expect(can(member, "orders", "edit")).toBe(true)
    expect(can(member, "shipments")).toBe(true)
    expect(can(member, "shipments", "edit")).toBe(false)
    expect(can(member, "partners")).toBe(false)
  })

  it("never gives a member more than the rules allow, whatever their saved grant", () => {
    // Purchase orders: Edit sets prices, so a grant saved without them reads as View.
    expect(effectiveAccess("buyer", { orders: "edit", shipments: "edit" })).toEqual({
      orders: "view",
      shipments: "edit"
    })
    expect(effectiveAccess("buyer", { orders: "edit", prices: "view" })).toEqual({ orders: "edit", prices: "view" })
    // A supplier's products are priced, a buyer's aren't.
    expect(effectiveAccess("supplier", { products: "edit" })).toEqual({ products: "view" })
    expect(effectiveAccess("buyer", { products: "edit" })).toEqual({ products: "edit" })
    // Catalogs are about money: without prices they're gone, and view-only pages stay view.
    expect(effectiveAccess("supplier", { catalogs: "edit", inventory: "view" })).toEqual({ inventory: "view" })
    expect(effectiveAccess("buyer", { restock: "edit", prices: "view" })).toEqual({ restock: "view", prices: "view" })
  })

  it("reads a link's page, with Settings open to everyone", () => {
    const member = { role: "member" as const, access: { restock: "view" } as const }
    expect(pageOf("/restock?status=order")).toBe("restock")
    expect(pageOf("/orders/0f6c")).toBe("orders")
    expect(pageOf("/settings#monthly-costs")).toBeUndefined()
    expect(canOpen(member, "/restock?cover=short")).toBe(true)
    expect(canOpen(member, "/products")).toBe(false)
    expect(canOpen(member, "/settings#integrations")).toBe(true)
  })

  it("shows members only their pages in the sidebar, and lands them on their first", () => {
    const member = { role: "member" as const, access: { shipments: "edit", inventory: "view" } as const }
    expect(navigationFor("supplier", member).map((item) => item.view)).toStrictEqual([
      "shipments",
      "inventory",
      "settings"
    ])
    expect(homeFor("supplier", member)).toBe("/shipments")
    expect(homeFor("supplier", { role: "member", access: { orders: "view" } })).toBe("/orders")
    expect(homeFor("buyer", { role: "member", access: {} })).toBe("/settings")
    expect(homeFor("buyer", { role: "admin", access: {} })).toBe("/overview")
    expect(areasFor("forwarder")).toStrictEqual([{ area: "orders", labelKey: "purchaseOrders" }])
  })
})

describe("the server's checks", () => {
  it("turns away a member without edit access to a page, naming it", async () => {
    signedIn.actor = actor("buyer", "member", { orders: "view", partners: "view" })
    const order = await send("order.create", {})
    expect(order.status).toBe(403)
    expect(await order.json()).toEqual({ error: "Ask an admin for access to Purchase orders" })
    const partner = await send("supplier.create", { name: "Unic" })
    expect(partner.status).toBe(403)
    expect(await partner.json()).toEqual({ error: "Ask an admin for access to Partners" })
    signedIn.actor = actor("supplier", "member", { orders: "edit" })
    expect(await (await send("shipment.save", {})).json()).toEqual({ error: "Ask an admin for access to Shipments" })
  })

  it("keeps the team and settings to owners and admins", async () => {
    signedIn.actor = actor("buyer", "member", { orders: "edit", shipments: "edit", partners: "edit" })
    for (const [name, data] of [
      ["team.invite", { email: "lee@club.example", role: "admin" }],
      ["team.access", { userId: "user-sam", role: "admin" }],
      ["team.remove", { userId: "user-sam" }],
      ["contact.create", {}],
      ["workspace.timeZone", { timeZone: "" }],
      ["connection.delete", { provider: "shopify" }],
      ["monthlyCost.create", {}]
    ] as const) {
      const response = await send(name, data)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: "Only admins can do this" })
    }
    // An admin gets past the check, to the request's own validation.
    signedIn.actor = actor("buyer", "admin")
    expect((await send("team.invite", { email: "not an email", role: "admin" })).status).toBe(400)
  })

  it("keeps prices from a member who doesn't see them", async () => {
    signedIn.actor = actor("buyer", "member", { orders: "view", shipments: "edit" })
    const approval = await send("shipment.approve", { id: "00000000-0000-4000-8000-000000000002", revision: 1 })
    expect(approval.status).toBe(403)
    expect(await approval.json()).toEqual({ error: "Ask an admin for access to prices and costs" })
    const po = await served(purchaseOrderPdf)(new Request("http://localhost:3000/api/orders/x/po"), {
      params: { id: "00000000-0000-4000-8000-000000000003" }
    })
    expect(po.status).toBe(403)
  })

  it("refuses priced order changes to a grant of Purchase orders: Edit saved without prices", async () => {
    signedIn.actor = actor("buyer", "member", { orders: "edit" })
    for (const name of ["order.create", "order.submit"]) {
      const response = await send(name, {})
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: "Ask an admin for access to Purchase orders" })
    }
  })

  it("keeps handing over and deleting the workspace to its owner", async () => {
    signedIn.actor = actor("buyer", "admin")
    for (const [name, data] of [
      ["team.transfer", { userId: "user-sam" }],
      ["workspace.delete", { name: "Test org" }]
    ] as const) {
      const response = await send(name, data)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: "Only the owner can do this" })
    }
  })

  it("answers a read of a page the member doesn't have with 403", async () => {
    signedIn.actor = actor("buyer", "member", { orders: "edit" })
    expect((await served(salesOrders)(new Request("http://localhost:3000/api/sales/orders"))).status).toBe(403)
  })
})
