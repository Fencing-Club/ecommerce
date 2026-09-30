import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { held, salesOrders, searchIndex } from "@/stories/fixtures/shared"
import { member } from "@/stories/workspace"
import { SearchCommand } from "./search-command"

// What the Orders page's search is asked, so a story can check that it was (or wasn't).
const salesSearched = fn<(query: string | null) => void>()

const meta = preview.meta({
  component: SearchCommand,
  args: { kind: "buyer" },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
  beforeEach: ({ msw }) => {
    salesSearched.mockClear()
    msw.use(
      http.get("/api/search", () => HttpResponse.json(searchIndex)),
      // The server finds sales orders by their number.
      http.get("/api/sales/orders", ({ request }) => {
        const query = new URL(request.url).searchParams.get("q")
        salesSearched(query)
        const orders = salesOrders.filter((order) => query && order.number.startsWith(query))
        return HttpResponse.json({ orders })
      })
    )
  }
})

async function openSearch(canvas: { getByRole: typeof screen.getByRole }) {
  await userEvent.click(canvas.getByRole("button", { name: "Search" }))
  return screen.findByRole("dialog", { name: "Search" })
}

function groupNames(panel: HTMLElement, group: string) {
  return within(within(panel).getByRole("group", { name: group }))
    .getAllByRole("option")
    .map((option) => option.textContent)
}

// Before anything is typed: the pages, and the newest purchase orders.
export const Open = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Search" })
    await expect(trigger).toHaveAttribute("aria-keyshortcuts", "Control+K")
    const panel = await openSearch(canvas)
    await expect(within(panel).getByRole("combobox")).toHaveFocus()
    await expect(groupNames(panel, "Pages")).toEqual([
      "Overview",
      "Sales",
      "Products",
      "Restock",
      "Purchase orders",
      "Shipments",
      "Partners",
      "Settings"
    ])
    const recent = await within(panel).findByRole("group", { name: "Recent purchase orders" })
    const orders = within(recent).getAllByRole("option")
    await expect(orders).toHaveLength(5)
    await expect(orders[0]).toHaveTextContent("PO-1046Lotus ManufacturingDraft")
    await expect(within(recent).queryByText("PO-1041")).toBeNull()
    // The first result is highlighted, and Enter opens it.
    await expect(within(panel).getByRole("option", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}")
    await expect(getRouter().push).toHaveBeenCalledWith("/products")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// Ctrl+K opens and closes it from anywhere, and Escape closes it.
export const KeyboardShortcut = meta.story({
  play: async () => {
    await userEvent.keyboard("{Control>}k{/Control}")
    const panel = await screen.findByRole("dialog", { name: "Search" })
    await expect(within(panel).getByRole("combobox")).toHaveFocus()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.keyboard("{Control>}k{/Control}")
    await screen.findByRole("dialog", { name: "Search" })
    await userEvent.keyboard("{Control>}k{/Control}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// Typing matches purchase orders, shipments, products and partners, each best first.
export const FindPartner = meta.story({
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    await userEvent.type(within(panel).getByRole("combobox"), "lotus")
    const partners = await within(panel).findByRole("group", { name: "Partners" })
    await expect(groupNames(panel, "Purchase orders")).toEqual([
      "PO-1046Lotus ManufacturingDraft",
      "PO-1045Lotus ManufacturingWith supplier",
      "PO-1042Lotus ManufacturingClosed",
      "PO-1041Lotus ManufacturingClosed"
    ])
    await expect(within(panel).queryByRole("group", { name: "Pages" })).toBeNull()
    await expect(within(panel).queryByRole("group", { name: "Products" })).toBeNull()
    // The server's sales orders are searched too, and have none.
    await waitFor(() => expect(salesSearched).toHaveBeenLastCalledWith("lotus"))
    await waitFor(() => expect(within(panel).queryByRole("progressbar")).toBeNull())
    await expect(within(panel).queryByRole("group", { name: "Sales orders" })).toBeNull()
    await userEvent.click(within(partners).getByRole("option", { name: /Lotus Manufacturing/ }))
    await expect(getRouter().push).toHaveBeenCalledWith("/partners?q=Lotus%20Manufacturing")
  }
})

export const FindShipment = meta.story({
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    await userEvent.type(within(panel).getByRole("combobox"), "FBA17")
    const shipments = await within(panel).findByRole("group", { name: "Shipments" })
    await expect(within(shipments).getAllByRole("option")).toHaveLength(1)
    // The purchase order with that Amazon shipment matches too.
    await expect(groupNames(panel, "Purchase orders")).toEqual(["PO-1045Lotus ManufacturingWith supplier"])
    await userEvent.click(within(shipments).getByRole("option", { name: /FBA17XK2Q9LP/ }))
    await expect(getRouter().push).toHaveBeenCalledWith("/shipments/shipment-1")
  }
})

export const FindProduct = meta.story({
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    // A variation's SKU finds its product.
    await userEvent.type(within(panel).getByRole("combobox"), "APRON-001")
    const products = await within(panel).findByRole("group", { name: "Products" })
    await userEvent.click(within(products).getByRole("option", { name: "Linen apron" }))
    await expect(getRouter().push).toHaveBeenCalledWith("/products?q=Linen%20apron")
  }
})

// Sales orders are searched on the server once typing pauses.
export const FindSalesOrder = meta.story({
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    await userEvent.type(within(panel).getByRole("combobox"), "#10")
    const orders = await within(panel).findByRole("group", { name: "Sales orders" })
    await expect(salesSearched).toHaveBeenCalledWith("#10")
    // Only once typing paused, not for each letter.
    await expect(salesSearched).not.toHaveBeenCalledWith("#1")
    await expect(
      within(orders)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["#1042Online StoreFulfilled", "#1017Online StoreUnfulfilled"])
    await userEvent.click(within(orders).getByRole("option", { name: /#1017/ }))
    await expect(getRouter().push).toHaveBeenCalledWith("/sales?q=%231017")
  }
})

export const NoResults = meta.story({
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    await userEvent.type(within(panel).getByRole("combobox"), "qqqq")
    await expect(await within(panel).findByText("No results for “qqqq”")).toBeInTheDocument()
    await expect(within(panel).queryAllByRole("option")).toHaveLength(0)
  }
})

// A supplier's pages, and no sales orders to search.
export const Supplier = meta.story({
  args: { kind: "supplier" },
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    await expect(groupNames(panel, "Pages")).toEqual([
      "Overview",
      "Orders",
      "Shipments",
      "Customers",
      "Products",
      "Inventory",
      "Catalogs",
      "Settings"
    ])
    await userEvent.type(within(panel).getByRole("combobox"), "cata")
    await expect(await within(panel).findByRole("option", { name: "Catalogs" })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 400))
    await expect(salesSearched).not.toHaveBeenCalled()
  }
})

// A member finds only the pages they were given, and no sales orders without the Orders page.
export const Member = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    await expect(groupNames(panel, "Pages")).toEqual(["Products", "Purchase orders", "Shipments", "Settings"])
    await userEvent.type(within(panel).getByRole("combobox"), "#10")
    await new Promise((resolve) => setTimeout(resolve, 400))
    await expect(salesSearched).not.toHaveBeenCalled()
  }
})

export const Loading = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/search", held))
  },
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    await expect(within(panel).getByRole("progressbar", { name: "Loading results" })).toBeInTheDocument()
    // The pages show while the rest loads.
    await expect(within(panel).getByRole("group", { name: "Pages" })).toBeInTheDocument()
  }
})

export const Failed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/search", () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    const panel = await openSearch(canvas)
    await expect(await within(panel).findByText("Couldn’t search everything. Try again.")).toBeInTheDocument()
    await expect(within(panel).getByRole("group", { name: "Pages" })).toBeInTheDocument()
  }
})

// On a phone the bar becomes a button.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Search" })
    await expect(within(trigger).getByText("Search")).toHaveClass("max-[30rem]:sr-only")
    await openSearch(canvas)
  }
})
