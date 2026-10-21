import { http, HttpResponse } from "msw/http"
import { delay } from "msw/utils/delay"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { salesOrders, syncState } from "@/stories/fixtures/catalog"
import { member } from "@/stories/workspace"
import { FinancialDataSyncCard, OrdersSyncRow, SalesOrders } from "./sales-orders"

const bothSources = { sources: [syncState("shopify"), syncState("amazon")] }

// The orders API's queries, newest last, as each story's list asked for them.
let queries: URLSearchParams[] = []

function ordersApi(respond: (query: URLSearchParams) => { orders: typeof salesOrders; total: number }) {
  return http.get("/api/sales/orders", ({ request }) => {
    const query = new URL(request.url).searchParams
    queries.push(query)
    return HttpResponse.json(respond(query))
  })
}

const lastQuery = () => Object.fromEntries(queries.at(-1) ?? [])

const meta = preview.meta({
  title: "Components/Sales and costs/Sales orders",
  component: SalesOrders,
  args: { initialSearch: "" },
  beforeEach: ({ msw }) => {
    queries = []
    msw.use(
      http.get("/api/sales", () => HttpResponse.json(bothSources)),
      ordersApi(() => ({ orders: salesOrders, total: salesOrders.length }))
    )
  }
})

export const SyncSettings = meta.story({
  render: () => <OrdersSyncRow source="amazon" />,
  beforeEach: ({ msw }) => {
    let queued = false
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({ sources: [syncState("amazon", { status: queued ? "queued" : "idle", progress: 0 })] })
      ),
      http.post("/api/sales/sync", async ({ request }) => {
        await expect(await request.json()).toEqual({ source: "amazon" })
        queued = true
        return HttpResponse.json({ status: "queued" })
      })
    )
  },
  play: async ({ canvas }) => {
    const sync = await canvas.findByRole("button", { name: "Sync Amazon orders" })
    await waitFor(() => expect(sync).toBeEnabled())
    await userEvent.click(sync)
    await expect(await canvas.findByText("Queued")).toBeVisible()
    await expect(sync).toBeDisabled()
    await expect(canvas.queryByRole("progressbar")).toBeNull()
  }
})

export const SyncSettingsFailed = meta.story({
  render: () => <OrdersSyncRow source="amazon" />,
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({ sources: [syncState("amazon", { status: "failed", errorCode: "reconnect" })] })
      )
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Needs attention")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Reconnect" })).toHaveAttribute("href", "/api/connections/amazon")
  }
})

export const SyncSettingsUnavailable = meta.story({
  render: () => <OrdersSyncRow source="amazon" />,
  beforeEach: ({ msw }) => msw.use(http.get("/api/sales", () => new HttpResponse(null, { status: 500 }))),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("button", { name: "Sync Amazon orders" })).toBeDisabled())
    await expect(await canvas.findByText("Status unavailable", { selector: "span" })).toBeVisible()
  }
})

export const Orders = meta.story({
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: "Orders" })
    await expect(within(table).getByRole("link", { name: /#1042/ })).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/harbor-goods/orders/1042"
    )
    await expect(within(table).getAllByText("(opens in Shopify)", { exact: false }).length).toBeGreaterThan(0)
    await expect(within(table).getByText("$129.50")).toBeInTheDocument()
    // Past three items, the rest are counted.
    await expect(within(table).getByText("1 more")).toBeInTheDocument()
    await expect(within(table).getByText("Replacement for 113-4827710-1111111")).toBeInTheDocument()
    await expect(within(table).getByText("Bundle", { exact: false })).toBeInTheDocument()
    // An Amazon order that hasn't been priced says so; a cancelled one has no sales.
    await expect(within(table).getAllByTitle("Amazon hasn’t priced this order yet")).toHaveLength(1)
    await expect(within(table).getAllByText("Canceled").length).toBeGreaterThan(0)
    await expect(canvas.getByText("1–5 of 5")).toBeVisible()

    const sources = canvas.getByRole("list", { name: "Sources" })
    await expect(within(sources).getByText("Shopify")).toBeVisible()
    await expect(within(sources).getByText("184")).toBeVisible()
    await expect(within(sources).getByText("655")).toBeVisible()
    await expect(within(sources).getAllByText(/^Synced/)).toHaveLength(2)
  }
})

export const Search = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(ordersApi((query) => (query.get("q") ? { orders: [], total: 0 } : { orders: salesOrders, total: 5 })))
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("table", { name: "Orders" })
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search orders" }), "wool socks")
    await expect(await canvas.findByText("No matching orders")).toBeVisible()
    await expect(lastQuery()).toEqual({ q: "wool socks", page: "0" })
  }
})

// A search from the header opens the list already filtered.
export const StartedFromSearch = meta.story({
  args: { initialSearch: "#1041" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("searchbox", { name: "Search orders" })).toHaveValue("#1041")
    await canvas.findByRole("table", { name: "Orders" })
    await expect(lastQuery()).toEqual({ q: "#1041", page: "0" })
  }
})

export const FilterBySource = meta.story({
  play: async ({ canvas }) => {
    await canvas.findByRole("table", { name: "Orders" })
    await userEvent.click(canvas.getByRole("combobox", { name: "Source" }))
    await userEvent.click(await screen.findByRole("option", { name: "Amazon" }))
    await waitFor(() => expect(lastQuery()).toEqual({ source: "amazon", page: "0" }))
    await expect(canvas.getByRole("combobox", { name: "Source" })).toHaveTextContent("Amazon")
  }
})

export const Pages = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(ordersApi(() => ({ orders: salesOrders, total: 120 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("1–50 of 120")).toBeVisible()
    const pages = canvas.getByRole("navigation", { name: "Order pages" })
    await expect(within(pages).getByRole("button", { name: /Previous/ })).toBeDisabled()
    await userEvent.click(within(pages).getByRole("button", { name: /Next/ }))
    await expect(await canvas.findByText("51–100 of 120")).toBeVisible()
    await waitFor(() => expect(lastQuery()).toEqual({ page: "1" }))
    await userEvent.click(within(pages).getByRole("button", { name: /Next/ }))
    await expect(await canvas.findByText("101–120 of 120")).toBeVisible()
    await expect(within(pages).getByRole("button", { name: /Next/ })).toBeDisabled()
  }
})

export const NoOrders = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(ordersApi(() => ({ orders: [], total: 0 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No orders yet")).toBeVisible()
  }
})

// A first sync is copying the store's order history.
export const FirstSync = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [
            syncState("shopify", {
              status: "running",
              progress: 0.4,
              coveredTo: null,
              finishedAt: null,
              orders: 0,
              recent: { orders: 0, units: 0 }
            })
          ]
        })
      ),
      ordersApi(() => ({ orders: [], total: 0 }))
    )
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText("Syncing your orders")).toBeVisible()
    await expect(canvas.getByText("40% copied")).toBeVisible()
    // Its icon sits on the muted tile every empty state has.
    await expect(canvasElement.querySelector("[data-slot=empty-icon]")).toHaveAttribute("data-variant", "icon")
    await expect(canvas.getByText("Syncing… 40%")).toBeVisible()
    // One source has nothing to filter by.
    await expect(canvas.queryByRole("combobox", { name: "Source" })).toBeNull()
  }
})

export const SyncFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [
            syncState("shopify", { status: "failed", errorCode: "reconnect" }),
            syncState("amazon", { status: "failed", errorCode: "provider_unavailable" })
          ]
        })
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings#integrations"
    )
    await expect(canvas.getByText("Couldn’t reach Amazon")).toBeVisible()
  }
})

// A member is told who can reconnect, and sees no money.
export const ForMember = meta.story({
  parameters: { permissions: member },
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({ sources: [syncState("shopify", { status: "failed", errorCode: "shopify_permissions" })] })
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Ask an admin to reconnect Shopify")).toBeVisible()
    const table = await canvas.findByRole("table", { name: "Orders" })
    await expect(within(table).queryByRole("columnheader", { name: "Sales" })).toBeNull()
    await expect(within(table).queryByRole("columnheader", { name: "Fees" })).toBeNull()
    await expect(within(table).queryByText("$36.00")).toBeNull()
  }
})

export const NoStore = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/sales", () => HttpResponse.json({ sources: [] })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Connect Shopify or Amazon")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Go to settings" })).toHaveAttribute(
      "href",
      "/settings#integrations"
    )
  }
})

export const NoStoreForMember = meta.story({
  parameters: { permissions: member },
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/sales", () => HttpResponse.json({ sources: [] })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No store connected")).toBeVisible()
    await expect(canvas.getByText("Ask an admin to connect one")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Go to settings" })).toBeNull()
  }
})

export const Loading = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/sales", async () => {
        await delay("infinite")
        return HttpResponse.json(bothSources)
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading orders…")).toBeInTheDocument()
    await expect(canvas.queryByRole("table")).toBeNull()
  }
})

export const ListLoading = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/sales/orders", async () => {
        await delay("infinite")
        return HttpResponse.json({ orders: [], total: 0 })
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("list", { name: "Sources" })).toBeVisible()
    await expect(canvas.getByText("Loading orders…")).toBeInTheDocument()
  }
})

export const StatusFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/sales", () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn’t load orders")
  }
})

export const ListFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/sales/orders", () => HttpResponse.json({ error: "Orders are being updated" }, { status: 503 }))
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Orders are being updated")
  }
})

const importedReport = { windows: [{ complete: true, status: "imported", checkedAt: "2026-10-18T00:00:00Z" }] }
const financialReports = {
  fees: { coveredFrom: "2024-10-18T00:00:00Z", coveredTo: "2026-10-18T00:00:00Z", errorCode: null },
  returns: importedReport,
  reimbursements: importedReport,
  storageFees: { monthly: importedReport, aged: importedReport },
  removals: { orders: importedReport, shipments: importedReport }
}

export const FinancialImported = meta.story({
  render: () => <FinancialDataSyncCard />,
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [{ ...syncState("amazon"), ...financialReports }]
        })
      )
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Financial reports imported")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sync Amazon financial data" })).toBeEnabled()
  }
})

export const FinancialFailed = meta.story({
  render: () => <FinancialDataSyncCard />,
  beforeEach: ({ msw }) => {
    let queued = false
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [
            {
              ...syncState("amazon", { status: queued ? "queued" : "idle" }),
              ...financialReports,
              storageFees: {
                monthly: importedReport,
                aged: { windows: [{ complete: false, status: "failed", checkedAt: "2026-10-18T00:00:00Z" }] }
              }
            }
          ]
        })
      ),
      http.post("/api/sales/sync", async ({ request }) => {
        await expect(await request.json()).toEqual({ source: "amazon" })
        queued = true
        return HttpResponse.json({ status: "queued" }, { status: 202 })
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Some financial reports failed. Saved data is retained.")).toBeVisible()
    await expect(canvas.queryByText("Synced", { exact: true })).toBeNull()
    const button = canvas.getByRole("button", { name: "Sync Amazon financial data" })
    await userEvent.click(button)
    await expect(await canvas.findByText("Queued")).toBeVisible()
    await expect(button).toBeDisabled()
    await expect(canvas.queryByRole("progressbar")).toBeNull()
  }
})

export const FinancialIncomplete = meta.story({
  render: () => <FinancialDataSyncCard />,
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [{ ...syncState("amazon"), returns: importedReport }]
        })
      )
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Some financial reports are not available yet.")).toBeVisible()
    await expect(canvas.queryByText("Synced", { exact: true })).toBeNull()
  }
})

export const FinancialReconnect = meta.story({
  render: () => <FinancialDataSyncCard />,
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [syncState("amazon", { status: "failed", errorCode: "reconnect" })]
        })
      )
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "Reconnect" })).toHaveAttribute(
      "href",
      "/api/connections/amazon"
    )
    await expect(canvas.queryByRole("button", { name: "Sync Amazon financial data" })).toBeNull()
  }
})

export const FinancialUnavailable = meta.story({
  render: () => <FinancialDataSyncCard />,
  beforeEach: ({ msw }) => msw.use(http.get("/api/sales", () => new HttpResponse(null, { status: 500 }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Status unavailable", { selector: "span" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sync Amazon financial data" })).toBeDisabled()
  }
})

export const FinancialFeesFailed = meta.story({
  render: () => <FinancialDataSyncCard />,
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [
            {
              ...syncState("amazon"),
              ...financialReports,
              fees: { ...financialReports.fees, errorCode: "fees_failed" }
            }
          ]
        })
      )
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Some financial reports failed. Saved data is retained.")).toBeVisible()
    await expect(canvas.queryByText("Synced", { exact: true })).toBeNull()
  }
})

export const FinancialIndependentOfOrders = meta.story({
  render: () => <FinancialDataSyncCard />,
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [
            { ...syncState("amazon", { status: "failed", errorCode: "provider_unavailable" }), ...financialReports }
          ]
        })
      )
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Financial reports imported")).toBeVisible()
    await expect(canvas.queryByText("Last sync failed")).toBeNull()
  }
})

export const FinancialFeesMissing = meta.story({
  render: () => <FinancialDataSyncCard />,
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/sales", () =>
        HttpResponse.json({
          sources: [
            {
              ...syncState("amazon"),
              ...financialReports,
              fees: { coveredFrom: null, coveredTo: null, errorCode: null }
            }
          ]
        })
      )
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Some financial reports are not available yet.")).toBeVisible()
    await expect(canvas.queryByText("Synced", { exact: true })).toBeNull()
  }
})
