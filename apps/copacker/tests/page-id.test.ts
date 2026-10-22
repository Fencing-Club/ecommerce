import { isNotFound } from "@tanstack/react-router"
import { describe, expect, it, vi } from "vitest"
import { NotFoundError } from "../src/i18n/errors"
import { GET as packet } from "../src/server/http/api/shipments/$id/packet"
import { pageId } from "../src/server/page-id"
import { pageResult } from "../src/server/page-result"
import { shipmentPacketResult } from "../src/server/shipment-packet"
import { served } from "./served"
import { signedIn, testSession } from "./test-session"

vi.mock("@/db", () => ({ db: () => null }))
vi.mock("../src/server/auth", async (original) => (await import("./test-session")).mockAuth(original))

const id = "00000000-0000-4000-8000-000000000001"
const supplier = testSession({ orgId: "00000000-0000-4000-8000-000000000002", kind: "supplier" })

describe("page ids", () => {
  it("passes a record's id through", () => {
    expect(pageId(id)).toBe(id)
  })
  it.each(["abc", "", id.slice(1), `${id}0`])("treats %j as a record that doesn't exist", (raw) => {
    expect(() => pageId(raw)).toThrow(NotFoundError)
  })
  it("shows Not found for a malformed shipment packet link, and answers its download 404", async () => {
    await expect(
      pageResult(() => shipmentPacketResult(supplier, "abc"), "shipments.detail.packet.title")
    ).rejects.toSatisfy(isNotFound)
    signedIn.actor = supplier
    const download = await served(packet)(new Request("http://localhost/api/shipments/abc/packet?section=verify"), {
      params: { id: "abc" }
    })
    expect(download.status).toBe(404)
  })
})
