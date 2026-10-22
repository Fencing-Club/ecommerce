import type { JsonBodyType } from "msw"
import { http, HttpResponse } from "msw/http"
import { delay } from "msw/utils/delay"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { restockChannels, restockLines, restockReport, suppliers } from "@/stories/fixtures/catalog"
import { supplierId } from "@/stories/fixtures/orders"
import { RestockReport } from "./restock-report"

// What each story's page asked the plan for, in order.
let plans: unknown[] = []

function planApi(report: (body: Record<string, unknown>) => JsonBodyType) {
  return http.post("/api/restock/plan", async ({ request }) => {
    const body = await request.json()
    const fields = typeof body === "object" && body !== null ? { ...body } : {}
    plans.push(fields)
    return HttpResponse.json(report(fields))
  })
}

// The suggestions take a moment: the page waits for its settings to settle before asking.
const loaded = { timeout: 4000 }
// The calculation is laid out for narrow and wide tables alike; the table's width shows one.
const shown = (elements: HTMLElement[]) => elements.filter((element) => element.checkVisibility())
const lotusGroup = () => screen.findByRole("region", { name: "Lotus Manufacturing" }, loaded)

const meta = preview.meta({
  title: "Components/Inventory/Restock report",
  component: RestockReport,
  args: { settings: { days: 60, leadTimeDays: 60 } },
  parameters: { router: { navigation: { pathname: "/restock" } } },
  beforeEach: ({ msw }) => {
    plans = []
    // The page remembers its channel, supplier and sort between visits.
    localStorage.removeItem("restock-channel")
    localStorage.removeItem("restock-supplier")
    localStorage.removeItem("restock-sort")
    msw.use(
      http.get("/api/restock/channels", () => HttpResponse.json(restockChannels)),
      http.get("/api/restock/suppliers", () => HttpResponse.json(suppliers)),
      planApi(() => restockReport())
    )
  }
})

export const Suggestions = meta.story({
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("4 to reorder, 1 can’t be calculated, 2 have enough stock", undefined, loaded)
    ).toBeVisible()
    await expect(plans).toEqual([{ days: 60, leadTimeDays: 60, channel: { kind: "amazon" }, supplier: "all" }])
    await expect(canvas.getByRole("link", { name: "Set a supplier" })).toHaveAttribute("href", "/products")

    // What the suggested lines add up to.
    await expect(canvas.getByText("$569.50")).toBeVisible()
    await expect(canvas.getByText("184")).toBeVisible()
    await expect(canvas.getByText("0.18 m³")).toBeVisible()
    await expect(canvas.getByText("1 line without a unit cost")).toBeVisible()
    await expect(canvas.getByText("2 lines without a case pack")).toBeVisible()
    await expect(canvas.getByRole("note")).toHaveTextContent("About $486.00 in lost sales before reorders arrive")

    // Copacker suppliers first, each with Reorder; a supplier only in Shopify is ordered outside Copacker.
    const lotus = await lotusGroup()
    await expect(within(lotus).getByText("2 products")).toBeVisible()
    const reorder = new URLSearchParams([
      ["variant", `${restockLines[0]!.variantId}@96`],
      ["variant", `${restockLines[1]!.variantId}@24`],
      ["destination", "amazon"],
      ["supplierId", supplierId]
    ])
    await expect(within(lotus).getByRole("button", { name: "Reorder" })).toHaveAttribute(
      "href",
      `/orders/new?${reorder}`
    )
    const coastal = canvas.getByRole("region", { name: "Coastal Paper" })
    await expect(within(coastal).getByText("Ordered outside Copacker")).toBeVisible()
  }
})

// Opening a supplier shows its lines: changing a quantity or leaving a line out changes the totals and Reorder.
export const EditOrder = meta.story({
  play: async ({ canvas }) => {
    const lotus = await lotusGroup()
    await userEvent.click(within(lotus).getByRole("button", { name: "Lotus Manufacturing" }))
    const units = within(lotus).getByRole("spinbutton", { name: "Units of Canvas tote bag, Natural to order" })
    await expect(units).toHaveValue(96)
    await userEvent.clear(units)
    await userEvent.type(units, "120")
    await expect(within(lotus).getByText("Suggested 96")).toBeVisible()
    await expect(canvas.getByText("208")).toBeVisible()

    await userEvent.click(within(lotus).getByRole("checkbox", { name: "Order Canvas tote bag, Black" }))
    await expect(within(lotus).getByText(/Lead time 45 days, 1 line, 120 units, 5 cases/)).toBeVisible()
    await expect(within(lotus).getByRole("button", { name: "Reorder" })).toHaveAttribute(
      "href",
      expect.stringContaining(`${encodeURIComponent(`${restockLines[0]!.variantId}@120`)}&destination=amazon`)
    )

    // Every figure of a suggestion, under its row.
    await userEvent.click(within(lotus).getByRole("button", { name: "Calculation for Canvas tote bag, Natural" }))
    for (const text of [
      "Sold in 60 days",
      "To order (4 cases of 24)",
      "Until today’s order arrives",
      "$486.00 (27 units)"
    ]) {
      await expect(shown(within(lotus).getAllByText(text))).toHaveLength(1)
    }
  }
})

export const ExpandAll = meta.story({
  play: async ({ canvas }) => {
    await lotusGroup()
    await userEvent.click(canvas.getByRole("button", { name: "Expand all" }))
    await expect(canvas.getAllByRole("table")).toHaveLength(3)
    // A line that can't be calculated says why, and can't be ordered.
    await expect(canvas.queryByRole("checkbox", { name: "Order Cotton napkins" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Collapse all" }))
    await expect(canvas.queryAllByRole("table")).toHaveLength(0)
  }
})

export const SearchAndSort = meta.story({
  play: async ({ canvas }) => {
    await lotusGroup()
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "apron")
    await waitFor(() => expect(canvas.queryByRole("region", { name: "Lotus Manufacturing" })).toBeNull())
    await expect(canvas.getByRole("region", { name: "Northwind Textiles" })).toBeVisible()

    await userEvent.clear(canvas.getByRole("searchbox", { name: "Search products" }))
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "wool")
    await expect(await canvas.findByText("No products match")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Set suppliers" })).toHaveAttribute("href", "/products")

    await userEvent.clear(canvas.getByRole("searchbox", { name: "Search products" }))
    await userEvent.click(canvas.getByRole("combobox", { name: "Sort by" }))
    await userEvent.click(await screen.findByRole("option", { name: "Product name" }))
    await expect(canvas.getByRole("combobox", { name: "Sort by" })).toHaveTextContent("Product name")
    await expect(localStorage.getItem("restock-sort")).toBe(JSON.stringify("name"))

    // Products with enough stock join the list on request.
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show products with enough stock" }))
    await expect(within(await lotusGroup()).getByText("5 products")).toBeVisible()
  }
})

// Opened from an Overview link: a channel, a days-of-cover group and only the items to reorder.
export const FromOverview = meta.story({
  args: { link: { channel: "shopify:81234", cover: "out", status: "order" } },
  play: async ({ canvas }) => {
    await lotusGroup()
    await expect(plans).toEqual([
      { days: 60, leadTimeDays: 60, channel: { kind: "shopify", locationId: "81234" }, supplier: "all" }
    ])
    await expect(canvas.getByRole("combobox", { name: "Restock location" })).toHaveTextContent("Harbor Warehouse")
    // Only the tote that's out of stock.
    await expect(within(await lotusGroup()).getByText("1 product")).toBeVisible()
    await expect(canvas.queryByRole("region", { name: "Northwind Textiles" })).toBeNull()

    await userEvent.click(canvas.getByRole("button", { name: /Days of cover: Out of stock/ }))
    await userEvent.click(canvas.getByRole("button", { name: /Items to reorder/ }))
    await expect(canvas.getByRole("region", { name: "Northwind Textiles" })).toBeVisible()
  }
})

export const ChooseLocationAndSupplier = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      planApi((body) => restockReport({ supplier: body.supplier, lines: body.supplier === "all" ? restockLines : [] }))
    )
  },
  play: async ({ canvas }) => {
    await lotusGroup()
    await userEvent.click(canvas.getByRole("combobox", { name: "Restock location" }))
    await userEvent.click(await screen.findByRole("option", { name: "Harbor Warehouse" }))
    await waitFor(
      () => expect(plans.at(-1)).toMatchObject({ channel: { kind: "shopify", locationId: "81234" } }),
      loaded
    )
    await expect(localStorage.getItem("restock-channel")).toBe(JSON.stringify("shopify:81234"))

    await userEvent.click(canvas.getByRole("combobox", { name: "Supplier" }))
    await userEvent.click(await screen.findByRole("option", { name: "Northwind Textiles" }))
    await expect(await canvas.findByText("No products linked to Northwind Textiles", undefined, loaded)).toBeVisible()
    await expect(plans.at(-1)).toMatchObject({ supplier: suppliers[1]!.id })
  }
})

export const KeepsSearchWhenSettingsChange = meta.story({
  play: async ({ canvas }) => {
    await lotusGroup()
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "wool")
    await expect(await canvas.findByText("No products match")).toBeVisible()
    await userEvent.click(canvas.getByRole("combobox", { name: "Supplier" }))
    await userEvent.click(await screen.findByRole("option", { name: "Northwind Textiles" }))
    await waitFor(() => expect(plans.at(-1)).toMatchObject({ supplier: suppliers[1]!.id }), loaded)
    await expect(await canvas.findByRole("searchbox", { name: "Search products" }, loaded)).toHaveValue("wool")
    await expect(await canvas.findByText("No products match")).toBeVisible()
  }
})

// The page recalculates once the typed settings are whole days again.
export const ChangeSettings = meta.story({
  play: async ({ canvas }) => {
    await lotusGroup()
    const days = canvas.getByRole("spinbutton", { name: "Sales period" })
    await userEvent.clear(days)
    await expect(days).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(days, "90")
    await expect(days).toHaveAttribute("aria-invalid", "false")
    await waitFor(() => expect(plans.at(-1)).toMatchObject({ days: 90, leadTimeDays: 60 }), loaded)
    await expect(plans).toHaveLength(2)
  }
})

// Items with no Amazon listing are listed apart, closed until opened.
export const NoListing = meta.story({
  play: async ({ canvas }) => {
    const panel = await canvas.findByRole("region", { name: "No Amazon listing" }, loaded)
    await expect(within(panel).getByText(/Create the FBA listing with the same SKU/)).toBeVisible()
    await userEvent.click(within(panel).getByRole("button", { name: "No Amazon listing" }))
    await expect(within(panel).getByText("Stoneware mug")).toBeVisible()
    await expect(within(panel).getByRole("columnheader", { name: "Minimum at Amazon" })).toBeVisible()
  }
})

// A member who sees no prices and can't make purchase orders sees quantities only.
export const ForMember = meta.story({
  parameters: { permissions: { role: "member", access: { restock: "view", orders: "view" } } },
  play: async ({ canvas }) => {
    await lotusGroup()
    await expect(canvas.queryByText("Estimated cost")).toBeNull()
    await expect(canvas.queryByRole("note")).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Reorder" })).toBeNull()
    // Suppliers are set by those who can change products.
    await expect(canvas.queryByRole("link", { name: "Set a supplier" })).toBeNull()
  }
})

export const NothingToReorder = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      planApi(() =>
        restockReport({ needsSupplier: 0, lines: restockLines.filter((line) => line.status === "stocked") })
      )
    )
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText("Nothing to reorder", undefined, loaded)).toBeVisible()
    await expect(canvas.getByText("0 to reorder, 1 has enough stock")).toBeVisible()
    // Its icon sits on the muted tile every empty state has.
    await expect(canvasElement.querySelector("[data-slot=empty-icon]")).toHaveAttribute("data-variant", "icon")
  }
})

// When a store's sales couldn't be read, lines that can't be calculated aren't listed.
export const SalesUnavailable = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      planApi(() =>
        restockReport({
          sources: [{ source: "amazon", error: "Amazon didn’t respond", window: null, gapUnits: 0, gapReasons: {} }]
        })
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Amazon: Amazon didn’t respond", undefined, loaded)).toBeVisible()
    const northwind = canvas.getByRole("region", { name: "Northwind Textiles" })
    await expect(within(northwind).getByText("1 product")).toBeVisible()
  }
})

export const Calculating = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/restock/plan", async () => {
        await delay("infinite")
        return HttpResponse.json(restockReport())
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Calculating…")).toBeVisible()
    await expect(canvas.queryByRole("region")).toBeNull()
  }
})

export const Failed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/restock/plan", () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Couldn’t calculate restock. Try again.", undefined, loaded)).toBeVisible()
  }
})

// Before the first stock sync there's no location to restock.
export const NoLocations = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/restock/channels", () => HttpResponse.json([])))
  },
  play: async ({ canvas }) => {
    const location = canvas.getByRole("combobox", { name: "Restock location" })
    await waitFor(() => expect(location).toHaveTextContent("Sync inventory first"))
    await expect(location).toHaveAttribute("data-disabled")
    await expect(canvas.queryByText("Calculating…")).toBeNull()
    await expect(plans).toEqual([])
  }
})
