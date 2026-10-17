import { beforeEach, describe, expect, it, vi } from "vitest"
import { LocalizedError } from "../src/i18n/errors"
import { AccessError } from "../src/i18n/errors"
import type { Permissions } from "../src/lib/access"
import { overview } from "../src/server/overview"
import { overviewPageData } from "../src/server/overview-page"
import { supplierOverview } from "../src/server/supplier-overview"
import { buyerOverview, supplierOverviewData, unconnectedOverview } from "../src/stories/fixtures/overview"

vi.mock("server-only", () => ({}))
vi.mock("../src/server/overview", () => ({ overview: vi.fn<typeof overview>() }))
vi.mock("../src/server/supplier-overview", () => ({ supplierOverview: vi.fn<typeof supplierOverview>() }))
vi.mock("../src/server/store-time-zone", () => ({ storeTimeZone: async () => "America/Los_Angeles" }))

const org = { id: "org_test", kind: "buyer" as const, timeZone: null, restockSalesDays: 42, restockLeadTimeDays: 17 }
const member: Permissions = { role: "member", access: { overview: "view", prices: "view", orders: "view" } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(overview).mockResolvedValue({ ...buyerOverview, setup: unconnectedOverview.setup })
  vi.mocked(supplierOverview).mockResolvedValue(supplierOverviewData)
})

describe("overview rendering data", () => {
  it("filters restricted links and admin setup before serialization, retaining workspace reporting settings", async () => {
    const query = { channel: "amazon", period: "30d" }
    const page = await overviewPageData({ ...member, org }, query)
    expect(page.kind).toBe("buyer")
    if (page.kind !== "buyer") {
      throw new Error("Expected buyer data")
    }
    expect(Object.keys(page).toSorted()).toEqual(["admin", "data", "kind"])
    expect(page.data.attention).toEqual(buyerOverview.attention.filter((item) => item.href.startsWith("/orders")))
    expect(page.data.setup).toEqual([])
    expect(overview).toHaveBeenCalledWith(
      {
        id: org.id,
        timeZone: "America/Los_Angeles",
        restockSalesDays: 42,
        restockLeadTimeDays: 17
      },
      { channel: "amazon", period: query }
    )
  })

  it("retains setup for administrators", async () => {
    const page = await overviewPageData({ role: "owner", access: {}, org }, {})
    expect(page.kind === "buyer" && page.admin).toBe(true)
    if (page.kind !== "buyer") {
      throw new Error("Expected buyer data")
    }
    expect(page.data.setup).toEqual(unconnectedOverview.setup)
  })

  it("returns only supplier rendering data and permissions", async () => {
    const page = await overviewPageData({ ...member, org: { ...org, kind: "supplier" } }, { compare: "year" })
    expect(page).toEqual({ kind: "supplier", permissions: member, data: supplierOverviewData })
    expect(overview).not.toHaveBeenCalled()
    expect(supplierOverview).toHaveBeenCalledWith({ id: org.id, timeZone: null }, { compare: "year" })
  })

  it("rejects a forwarder before reading buyer data", async () => {
    await expect(
      overviewPageData({ role: "owner", access: {}, org: { ...org, kind: "forwarder" } }, {})
    ).rejects.toThrow(LocalizedError)
    expect(overview).not.toHaveBeenCalled()
    expect(supplierOverview).not.toHaveBeenCalled()
  })

  it.each<Permissions>([
    { role: "member", access: {} },
    { role: "member", access: { overview: "view" } },
    { role: "member", access: { prices: "view" } }
  ])("does not read or serialize figures without both page and price access: %j", async (permissions) => {
    await expect(overviewPageData({ ...permissions, org }, {})).rejects.toThrow(AccessError)
    expect(overview).not.toHaveBeenCalled()
    expect(supplierOverview).not.toHaveBeenCalled()
  })
})
