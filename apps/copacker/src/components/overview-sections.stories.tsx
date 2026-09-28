import { expect, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { buyerOverview, setupSteps } from "@/stories/fixtures/overview"
import { member } from "@/stories/workspace"
import {
  Attention,
  BestSellers,
  CardLink,
  Customers,
  Dash,
  DaysOfCover,
  DeltaPill,
  OpenOrders,
  ProfitBreakdown,
  SetupChecklist,
  SlowStock,
  StockByChannel,
  Trending,
  UpcomingSpend
} from "./overview-sections"

const { sales, restock, purchasing, upcoming, period, attention } = buyerOverview
const customers = sales.customers!

const meta = preview.meta({
  component: Attention,
  args: { items: attention }
})

export const AttentionItems = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Needs attention")).toBeVisible()
    await expect(canvas.getByText("3")).toBeVisible()
    await expect(canvas.getByRole("link", { name: /2 items will run out/ })).toHaveAttribute(
      "href",
      "/restock?status=order"
    )
    await expect(canvas.getByRole("link", { name: /1 draft purchase order/ })).toHaveAttribute(
      "href",
      "/orders?status=draft"
    )
  }
})

export const AttentionCaughtUp = meta.story({
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("All caught up")).toBeVisible()
    await expect(canvas.queryByRole("link")).toBeNull()
  }
})

// A member without Restock sees the item, but not as a link to a page they can't open.
export const AttentionForMember = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 items will run out")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /2 items will run out/ })).toBeNull()
    await expect(canvas.getByRole("link", { name: /1 draft purchase order/ })).toBeVisible()
  }
})

export const Setup = meta.story({
  render: () => <SetupChecklist steps={setupSteps} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Finish setting up")).toBeVisible()
    await expect(canvas.getByText("1 of 4 done")).toBeVisible()
    await expect(canvas.getByText("Done")).toBeInTheDocument()
    // A step whose first sync is running says how far it has got.
    await expect(canvas.getByText("Syncing… 40%")).toBeVisible()
    await expect(canvas.getByRole("link", { name: /Sync your stock/ })).toHaveAttribute("href", "/products")
    await expect(canvas.queryByRole("link", { name: /Connect a store/ })).toBeNull()
  }
})

export const Stock = meta.story({
  render: () => <StockByChannel restock={restock} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2,100 on hand")).toBeVisible()
    await expect(canvas.getByText("600 on the way")).toBeVisible()
    await expect(canvas.getByText("$12,100.00 at cost")).toBeVisible()
    await expect(canvas.getByText("3,120")).toBeVisible()
    // Retail value less cost: $42,100 - $18,400.
    await expect(canvas.getByText("$23,700.00")).toBeVisible()
    await expect(canvas.getByRole("button", { name: /Products/ })).toHaveAttribute("href", "/products")
    await userEvent.hover(canvas.getByRole("button", { name: "About inventory values" }))
    await expect(await screen.findByText(/Retail value uses what each unit recently sold for/)).toBeInTheDocument()
  }
})

export const StockNotSynced = meta.story({
  render: () => (
    <StockByChannel
      restock={{ ...restock, channels: [], unitsOnHand: 0, stockValue: [], retailValue: [], uncosted: 2, unpriced: 2 }}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No stock synced")).toBeVisible()
    // Values that can't be worked out read as a dash, with the reason for screen readers.
    await expect(canvas.getByText("No unit costs")).toBeInTheDocument()
    await expect(canvas.getByText("No prices")).toBeInTheDocument()
    await expect(canvas.getByText("Not available")).toBeInTheDocument()
  }
})

export const Cover = meta.story({
  render: () => <DaysOfCover restock={restock} channel={null} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Days of cover")).toBeVisible()
    await expect(canvas.getByRole("link", { name: /Out of stock/ })).toHaveAttribute(
      "href",
      "/restock?channel=amazon&cover=out"
    )
    await expect(canvas.getByRole("link", { name: /2 to 4 weeks/ })).toHaveAttribute(
      "href",
      "/restock?channel=shopify%3A81234&cover=under30"
    )
    // A group with no items isn't a link.
    await expect(canvas.queryByRole("link", { name: /Not selling/ })).toBeNull()
    await expect(canvas.getByText("0 items")).toBeInTheDocument()
  }
})

// With a channel chosen on the Overview, every row opens Restock on that channel.
export const CoverForChannel = meta.story({
  render: () => <DaysOfCover restock={restock} channel="amazon" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /2 to 4 weeks/ })).toHaveAttribute(
      "href",
      "/restock?channel=amazon&cover=under30"
    )
  }
})

export const Spend = meta.story({
  render: () => <UpcomingSpend upcoming={upcoming} channel="amazon" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Next 60 days")).toBeVisible()
    await expect(canvas.getByText("$18,420.00")).toBeVisible()
    await expect(canvas.getByRole("link", { name: /Reorders due now/ })).toHaveAttribute(
      "href",
      "/restock?status=order&channel=amazon"
    )
    await expect(canvas.getByRole("link", { name: /Past due/ })).toHaveAttribute("href", "/orders")
    await expect(canvas.getAllByText("3 purchase orders")).toHaveLength(2)
    // Due dates without purchase orders are left out.
    await expect(canvas.queryByText("Due in 31 to 60 days")).toBeNull()
  }
})

export const TrendingProducts = meta.story({
  render: () => <Trending movers={sales.movers} comparable period={period} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Selling more")).toBeVisible()
    await expect(canvas.getByText("Natural, 52 to 84 units")).toBeVisible()
    await expect(canvas.getByText("30 to 12 units")).toBeVisible()
    await expect(canvas.getByText("+62%")).toBeVisible()
    await expect(canvas.getByText("-60%")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Canvas tote bag" })).toHaveAttribute("href", "/restock?q=TOTE-NAT")
  }
})

export const TrendingWithoutComparison = meta.story({
  render: () => (
    <Trending
      movers={{ rising: [], falling: [] }}
      comparable={false}
      period={{ ...period, previous: null, comparison: "none" }}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No comparison period")).toBeVisible()
  }
})

export const TrendingWithoutEarlierOrders = meta.story({
  render: () => <Trending movers={{ rising: [], falling: [] }} comparable={false} period={period} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^No orders synced for /)).toBeVisible()
  }
})

export const TrendingWithoutChanges = meta.story({
  render: () => <Trending movers={{ rising: [], falling: [] }} comparable period={period} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No product changed by more than a few units")).toBeVisible()
  }
})

export const Slow = meta.story({
  render: () => <SlowStock restock={restock} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 items, 340 units, $2,100.00 at cost")).toBeVisible()
    const rows = canvas.getAllByRole("row")
    await expect(within(rows[1]!).getByText("Market basket")).toBeVisible()
    await expect(within(rows[1]!).getByText("$1,600.00")).toBeVisible()
    await expect(within(rows[2]!).getByText("No unit cost")).toBeInTheDocument()
    await expect(within(rows[2]!).getByText("Not selling")).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "Market basket" })).toHaveAttribute(
      "href",
      "/restock?channel=shopify%3A81234&cover=over90&q=BASKET-L"
    )
  }
})

export const SlowEmpty = meta.story({
  render: () => <SlowStock restock={{ ...restock, slow: { items: 0, units: 0, value: [], top: [] } }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No slow-moving stock")).toBeVisible()
    await expect(canvas.queryByRole("table")).toBeNull()
  }
})

export const Sellers = meta.story({
  render: () => <BestSellers restock={restock} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Best sellers")).toBeVisible()
    await expect(canvas.getByText("Reorder now")).toBeVisible()
    await expect(canvas.getByText("In stock")).toBeVisible()
    await expect(canvas.getByText("Natural, TOTE-NAT")).toBeVisible()
    await expect(canvas.getByRole("button", { name: /Restock/ })).toHaveAttribute("href", "/restock")
  }
})

export const SellersEmpty = meta.story({
  render: () => <BestSellers restock={{ ...restock, bestSellers: [] }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No sales yet")).toBeVisible()
  }
})

export const PurchaseOrders = meta.story({
  render: () => <OpenOrders purchasing={purchasing} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Open purchase orders")).toBeVisible()
    await expect(canvas.getByText("Lotus Manufacturing")).toBeVisible()
    // Past five suppliers, the rest share one row.
    await expect(canvas.getByText("1 other supplier")).toBeVisible()
    await expect(canvas.queryByText("Birch Supply")).toBeNull()
    await expect(canvas.getByText("€1,200.00")).toBeVisible()
    await expect(canvas.getByText("7 purchase orders")).toBeVisible()
    await expect(canvas.getByText("$3,100.00")).toBeVisible()
  }
})

export const PurchaseOrdersEmpty = meta.story({
  render: () => <OpenOrders purchasing={{ openCount: 0, open: [], draftCount: 0, drafts: [], bySupplier: [] }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No open purchase orders")).toBeVisible()
    await expect(canvas.getAllByText("0 purchase orders")).toHaveLength(2)
  }
})

// A member without Purchase orders doesn't get the card's link.
export const PurchaseOrdersForMember = meta.story({
  parameters: { permissions: { role: "member", access: { overview: "view", prices: "view" } } },
  render: () => <OpenOrders purchasing={purchasing} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Open purchase orders")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Purchase orders/ })).toBeNull()
  }
})

export const Profit = meta.story({
  render: () => <ProfitBreakdown sales={sales} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Cost of goods")).toBeVisible()
    await expect(canvas.getByText("Monthly costs", { selector: "span" })).toBeVisible()
    await expect(canvas.getByText("Advertising")).toBeVisible()
    await expect(canvas.getByText("28%")).toBeVisible()
    await expect(canvas.getByRole("button", { name: /Monthly costs/ })).toHaveAttribute(
      "href",
      "/settings#monthly-costs"
    )
    // A line made of several charges lists them on hover.
    await userEvent.hover(canvas.getByRole("button", { name: "What’s in Refunds and disputes" }))
    await expect(await screen.findByText("Amazon refunds")).toBeInTheDocument()
    await expect(screen.getByText("Shopify disputes")).toBeInTheDocument()
  }
})

export const ProfitWithoutCosts = meta.story({
  render: () => <ProfitBreakdown sales={{ ...sales, profit: { ...sales.profit, costedRevenueMinor: 0 } }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Needs order prices and unit costs")).toBeVisible()
  }
})

export const ShopifyCustomers = meta.story({
  render: () => <Customers customers={customers} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Customer lifetime value")).toBeVisible()
    // $96,000 over 1,200 customers.
    await expect(canvas.getByText("$80.00")).toBeVisible()
    await expect(canvas.getByText("25%")).toBeVisible()
    await expect(canvas.getByText("45 of 180 in this period")).toBeVisible()
    await expect(canvas.getByText("1.5")).toBeVisible()
  }
})

export const CustomersReconnect = meta.story({
  render: () => <Customers customers={{ ...customers, status: "reconnect" }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings#integrations")
  }
})

export const CustomersReconnectForMember = meta.story({
  parameters: { permissions: member },
  render: () => <Customers customers={{ ...customers, status: "reconnect" }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ask an admin to reconnect Shopify to count repeat customers")).toBeVisible()
  }
})

export const CustomersSyncing = meta.story({
  render: () => <Customers customers={{ ...customers, status: "syncing" }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Available after the next Shopify order sync")).toBeVisible()
  }
})

export const CustomersWithoutAny = meta.story({
  render: () => (
    <Customers customers={{ ...customers, customers: 0, returning: 0, yearCustomers: 0, repeatCustomers: 0 }} />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("No customers")).toHaveLength(4)
  }
})

export const Pieces = meta.story({
  render: () => (
    <div className="flex items-center gap-3">
      <DeltaPill value={0.125} title="vs previous period" />
      <DeltaPill value={-0.4} />
      <DeltaPill value={0.001} />
      <DeltaPill value={null} />
      <Dash reason="No unit cost" />
      <CardLink href="/sales">Orders</CardLink>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle("vs previous period")).toHaveTextContent("+13%")
    await expect(canvas.getByText("-40%")).toBeVisible()
    await expect(canvas.getByText("+0.1%")).toBeVisible()
    await expect(canvas.getByText("New")).toBeVisible()
    await expect(canvas.getByTitle("No unit cost")).toHaveTextContent("—")
    await expect(canvas.getByRole("button", { name: /Orders/ })).toHaveAttribute("href", "/sales")
  }
})
