import { money } from "@repo/copacker-orders"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import { formatStory, localeStory, translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { type Locale } from "@/i18n/locales"
import { can, isAdmin, type Permissions } from "@/lib/access"
import { storeNames } from "@/lib/stores"
import { timeZoneLabel } from "@/lib/time-zone"
import type { MonthlyCost } from "@/server/monthly-costs"
import { restockSettings } from "@/server/restock-report"
import { type ActionRequest, recordActions } from "@/stories/actions"
import {
  amazonAccount,
  buyerContacts,
  ebayAccount,
  forwarderRecordId,
  inventoryLocations,
  shopifyAccount,
  storeSyncHandlers,
  supplierContacts,
  supplierRecordId,
  team
} from "@/stories/fixtures/logistics"
import { lotusFactory, baylineShenzhen } from "@/stories/fixtures/parties"
import { shownDialog } from "@/stories/play"
import { portalPage, serverStory } from "@/stories/server"
import { member, owner, person, type WorkspaceKind, workspaces } from "@/stories/workspace"
import PageView from "./page"

type Contact = (typeof buyerContacts)[number] & { supplierId: string | null; forwarderId: string | null }

type Args = {
  kind: WorkspaceKind
  permissions: Permissions
  org: {
    name: string
    timeZone: string | null
    excludedShopifyTags: string[]
    restockSalesDays: number | null
    restockLeadTimeDays: number | null
  }
  // The viewer's computer's zone and language, as the browser reports them.
  computerZone: string
  computerLocale: Locale
  person: { firstName: string; lastName: string; position: string; company: string; locale: string | null } | null
  // The workspace's own contact details (supplier_profiles).
  profile: {
    website: string | null
    contactName: string | null
    contactEmail: string | null
    phoneNumber: string | null
  } | null
  linked: Array<{ provider: "shopify" | "amazon" | "ebay"; externalId: string }>
  saved: Contact[]
  costs: MonthlyCost[]
  currency: string
  team: typeof team
  // What the stores say about themselves: Shopify's name, Amazon's name and marketplaces, and the eBay seller's
  // username (null when they didn't answer).
  shopName: string | null
  amazonStore: { name: string; marketplaces: string[] } | null
  ebayName: string | null
  // Whether Copacker has its eBay keys.
  orderTags: string[]
  // The store's Shopify locations and what each counts as.
  locations: typeof inventoryLocations.locations
  // The workspaces the person owns: those others use, and those that close with the account.
  owned: { handOver: string[]; closing: string[] }
}

// The Settings page (page.tsx) with what the database, the stores and the browser would return.
async function SettingsPage(args: Args) {
  const { kind, permissions: s, org, computerZone, person: saved, profile } = args
  const buyer = kind === "buyer"
  const supplier = kind === "supplier"
  const admin = isAdmin(s)
  const finances = buyer && can(s, "overview") && can(s, "prices")
  const restock = restockSettings(org)
  const costs = finances ? args.costs : []
  const currency = finances ? args.currency : "USD"
  const shopifyAccount = args.linked.find((c) => c.provider === "shopify")
  const amazonAccount = args.linked.find((c) => c.provider === "amazon")
  const ebayAccount = args.linked.find((c) => c.provider === "ebay")
  const shopName = shopifyAccount ? args.shopName : null
  const amazon = amazonAccount ? args.amazonStore : null
  const ebayName = ebayAccount ? args.ebayName : null
  const orderTags = buyer && shopifyAccount && admin ? args.orderTags : []
  const ownLocations = buyer
    ? args.locations
        .filter((location) => location.classification === "merchant")
        .map((location) => ({ id: location.locationId, name: location.name }))
    : []
  const [t, format, locale] = await Promise.all([translateStory("settings"), formatStory(), localeStory()])
  const date = (day: string) =>
    format.dateTime(new Date(`${day}T00:00:00Z`), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  return (
    <PageView
      page={{
        s: { org: { ...workspaces[kind], ...org }, user: { id: person.id, email: person.email }, role: s.role },
        computerZone,
        buyer,
        supplier,
        admin,
        finances,
        restock,
        saved: args.saved.filter(
          (contact) => !contact.supplierId && (contact.kind !== "forwarder" || !contact.forwarderId)
        ),
        profile,
        costs: costs.map((cost) => ({
          id: cost.id,
          name: cost.name,
          amount: money(cost.amountMinor, cost.currency, locale),
          details: costDetails(cost, t, date)
        })),
        currency,
        team: args.team,
        shopifyAccount,
        amazonAccount,
        ebayAccount,
        shopName,
        amazon,
        ebayName,
        orderTags,
        ownLocations,
        person: saved,
        owned: {
          handOver: args.owned.handOver.map((name) => ({ name })),
          closing: args.owned.closing.map((name) => ({ name }))
        },
        computerLocale: args.computerLocale,
        amazonAdsAvailable: false,
        amazonSelfAuth: true
      }}
    />
  )
}

function costDetails(
  cost: MonthlyCost,
  t: Awaited<ReturnType<typeof translateStory<"settings">>>,
  date: (day: string) => string
) {
  const channel = cost.channel ? storeNames[cost.channel] : t("monthlyCosts.allChannels")
  if (cost.startsOn && cost.endsOn) {
    return t("monthlyCosts.between", { channel, start: date(cost.startsOn), end: date(cost.endsOn) })
  }
  if (cost.startsOn) {
    return t("monthlyCosts.since", { channel, start: date(cost.startsOn) })
  }
  return cost.endsOn ? t("monthlyCosts.until", { channel, end: date(cost.endsOn) }) : channel
}

function contact(saved: (typeof buyerContacts)[number], owners: Partial<Contact> = {}): Contact {
  return { ...saved, supplierId: null, forwarderId: null, ...owners }
}

// The buyer's addresses: its own, and ones kept with a partner, which the Partners page shows instead.
const buyerSaved: Contact[] = [
  ...buyerContacts.map((saved) => contact(saved)),
  contact(
    {
      id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a08",
      name: "Kept for Lotus",
      kind: "pickup",
      address: lotusFactory,
      shopifyLocationId: null
    },
    { supplierId: supplierRecordId }
  ),
  contact(
    {
      id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a09",
      name: "Kept for Bayline",
      kind: "forwarder",
      address: baylineShenzhen,
      shopifyLocationId: null
    },
    { forwarderId: forwarderRecordId }
  )
]

const costs: MonthlyCost[] = [
  {
    id: "c05t0000-0000-4000-8000-000000000001",
    name: "Marketplace Connect",
    amountMinor: 4900,
    currency: "USD",
    channel: null,
    startsOn: null,
    endsOn: null
  },
  {
    id: "c05t0000-0000-4000-8000-000000000002",
    name: "Warehouse rent",
    amountMinor: 180000,
    currency: "USD",
    channel: "amazon",
    startsOn: "2026-01-05",
    endsOn: null
  },
  {
    id: "c05t0000-0000-4000-8000-000000000003",
    name: "Trade show booth",
    amountMinor: 25000,
    currency: "USD",
    channel: "shopify",
    startsOn: "2026-03-01",
    endsOn: "2026-05-31"
  }
]

const buyerArgs: Args = {
  kind: "buyer",
  permissions: owner,
  org: {
    name: workspaces.buyer.name,
    timeZone: "America/Los_Angeles",
    excludedShopifyTags: ["Amazon"],
    restockSalesDays: 90,
    restockLeadTimeDays: null
  },
  computerZone: "America/New_York",
  computerLocale: "en",
  person: { firstName: "Alex", lastName: "Rivera", position: "Owner", company: "", locale: null },
  profile: { website: "https://harbor.example.com", contactName: null, contactEmail: null, phoneNumber: null },
  linked: [
    { provider: "shopify", externalId: shopifyAccount },
    { provider: "amazon", externalId: amazonAccount },
    { provider: "ebay", externalId: "ebay-user-1234" }
  ],
  saved: buyerSaved,
  costs,
  currency: "USD",
  team,
  shopName: "Harbor Goods",
  amazonStore: { name: "Harbor Goods US", marketplaces: ["United States", "Canada"] },
  ebayName: ebayAccount,
  orderTags: ["Amazon", "wholesale", "sample"],
  locations: inventoryLocations.locations,
  owned: { handOver: [], closing: [workspaces.buyer.name] }
}

const sent: ActionRequest[] = []
const buyer = portalPage("/settings")
const supplier = portalPage("/settings", "supplier")
const forwarder = portalPage("/settings", "forwarder")

const meta = preview.meta({
  title: "Pages/Settings",
  ...serverStory(SettingsPage),
  args: buyerArgs,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent), ...storeSyncHandlers())
  }
})

// The buyer's owner sees and changes every section.
export const BuyerOwner = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible()
    await expect(canvas.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Profile",
      "Language",
      "Team",
      "Integrations",
      "Restock",
      "Time zone",
      "Monthly costs",
      "Addresses",
      "Delete"
    ])
    const profile = canvas.getByRole("region", { name: "Profile" })
    await expect(profile).toHaveTextContent(person.email)
    // The company falls back to the workspace's name, and its website shows for the owner.
    await expect(within(profile).getByRole("textbox", { name: "Company" })).toHaveValue("Harbor Goods")
    await expect(within(profile).getByRole("textbox", { name: "Company website" })).toHaveValue("harbor.example.com")
    const restock = canvas.getByRole("region", { name: "Restock" })
    await expect(within(restock).getByRole("spinbutton", { name: "Sales period (days)" })).toHaveValue(90)
    await expect(within(restock).getByRole("spinbutton", { name: "Lead time (days)" })).toHaveValue(60)
    await expect(
      within(canvas.getByRole("region", { name: "Time zone" })).getByRole("combobox", { name: "Store time zone" })
    ).toHaveTextContent(timeZoneLabel("America/Los_Angeles"))
    const monthly = canvas.getByRole("region", { name: "Monthly costs" })
    await expect(monthly).toHaveTextContent("3 costs")
    await expect(monthly).toHaveTextContent("$1,800")
    await expect(monthly).toHaveTextContent("Amazon, since Jan 5, 2026")
    await expect(monthly).toHaveTextContent("Shopify, Mar 1, 2026 to May 31, 2026")
    // Addresses kept with a supplier or forwarder are on the Partners page instead.
    const addresses = canvas.getByRole("region", { name: "Addresses" })
    await expect(addresses).toHaveTextContent("4 addresses")
    await expect(within(addresses).queryByText("Kept for Lotus")).toBeNull()
    await expect(within(addresses).queryByText("Kept for Bayline")).toBeNull()
    await expect(within(addresses).getByText("Stock arrives at Portland warehouse")).toBeVisible()
    const deletion = canvas.getByRole("region", { name: "Delete" })
    await expect(within(deletion).getByRole("button", { name: "Delete workspace" })).toBeVisible()
    await expect(within(canvas.getByRole("region", { name: "Team" })).getByText("3 people")).toBeVisible()
  }
})

// A connected store's card opens its settings: order and stock syncs, locations and excluded tags for Shopify.
export const ShopifySettings = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    const integrations = canvas.getByRole("region", { name: "Integrations" })
    await expect(within(integrations).getByText(shopifyAccount)).toBeVisible()
    await userEvent.click(within(integrations).getByRole("button", { name: "Manage Shopify" }))
    const sheet = await shownDialog("Shopify")
    await expect(sheet.getByRole("heading", { name: "Orders" })).toBeInTheDocument()
    await expect(sheet.getByRole("heading", { name: "Inventory" })).toBeInTheDocument()
    await expect(await sheet.findByText("Portland warehouse")).toBeInTheDocument()
    await expect(sheet.getByRole("heading", { name: "Excluded order tags" })).toBeInTheDocument()
    await userEvent.click(sheet.getByRole("button", { name: "Edit excluded order tags" }))
    const dialog = await shownDialog("Excluded order tags")
    // The store's own tags are suggested.
    await userEvent.click(dialog.getByRole("button", { name: "wholesale" }))
    await userEvent.click(dialog.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "workspace.excludedShopifyTags", data: { tags: ["Amazon", "wholesale"] } }])
    )
  }
})

export const AmazonSettings = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Manage Amazon" }))
    const sheet = await shownDialog("Amazon")
    await expect(sheet.element).toHaveTextContent("Harbor Goods US")
    for (const name of ["Orders", "Inventory", "Financial data"]) {
      await waitFor(() => expect(sheet.getByRole("heading", { name })).toBeVisible())
    }
    await expect(sheet.getByRole("button", { name: "Sync Amazon financial data" })).toBeVisible()
    await expect(sheet.element).not.toHaveTextContent(amazonAccount)
    await expect(sheet.element).not.toHaveTextContent("Amazon Ads")
    await waitFor(() => expect(sheet.getByText("United States")).toBeVisible())
    await expect(sheet.getByText("Canada")).toBeVisible()
    await expect(sheet.queryByRole("heading", { name: "Excluded order tags" })).toBeNull()
  }
})

// A missing store name never exposes the account identifier.
export const AmazonUnavailable = meta.story({
  ...buyer,
  args: { amazonStore: null, linked: [{ provider: "amazon", externalId: amazonAccount }] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(amazonAccount)).toBeNull()
    await expect(canvas.getByRole("button", { name: "Connect Shopify" })).toHaveTextContent("Connect")
    await userEvent.click(canvas.getByRole("button", { name: "Manage Amazon" }))
    const sheet = await shownDialog("Amazon")
    await expect(sheet.element).toHaveTextContent("Couldn’t load from Amazon")
  }
})

export const NothingConnected = meta.story({
  ...buyer,
  args: { linked: [] },
  play: async ({ canvas }) => {
    const integrations = canvas.getByRole("region", { name: "Integrations" })
    await expect(within(integrations).getByRole("button", { name: "Connect Shopify" })).toHaveTextContent("Connect")
    await expect(within(integrations).getByRole("link", { name: "Connect eBay" })).toHaveAttribute(
      "href",
      "/api/connections/ebay"
    )
    // Amazon starts with a marketplace choice.
    await userEvent.click(within(integrations).getByRole("button", { name: "Connect Amazon" }))
    await expect(await screen.findByRole("dialog", { name: "Connect Amazon" })).toBeInTheDocument()
  }
})

// eBay's settings are its order sync alone: it sells the stock Shopify tracks.
export const EbaySettings = meta.story({
  ...buyer,
  play: async ({ canvas }) => {
    const integrations = canvas.getByRole("region", { name: "Integrations" })
    await expect(within(integrations).getByText(ebayAccount)).toBeVisible()
    await userEvent.click(within(integrations).getByRole("button", { name: "Manage eBay" }))
    const sheet = await shownDialog("eBay")
    await expect(sheet.getByRole("heading", { name: "Orders" })).toBeInTheDocument()
    await expect(sheet.queryByRole("heading", { name: "Inventory" })).toBeNull()
    await expect(await sheet.findByText(/./, { selector: "time" })).toBeInTheDocument()
    await expect(sheet.getByRole("button", { name: "Sync eBay orders" })).toBeEnabled()
  }
})

// eBay didn't say whose account it is: it shows by its ID.
export const EbayUnnamed = meta.story({
  ...buyer,
  args: { ebayName: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("ebay-user-1234")).toBeVisible()
  }
})

// An admin who doesn't own the workspace can't delete it or hand it over.
export const BuyerAdmin = meta.story({
  ...buyer,
  parameters: { ...buyer.parameters, permissions: { role: "admin", access: {} } },
  args: { permissions: { role: "admin", access: {} }, owned: { handOver: [], closing: [] } },
  play: async ({ canvas }) => {
    const deletion = canvas.getByRole("region", { name: "Delete" })
    await expect(within(deletion).queryByRole("button", { name: "Delete workspace" })).toBeNull()
    await expect(within(deletion).getByRole("button", { name: "Delete account" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Invite" })).toBeVisible()
    await expect(canvas.getByRole("spinbutton", { name: "Sales period (days)" })).toBeVisible()
  }
})

const overviewMember: Permissions = { role: "member", access: { overview: "view", orders: "view", prices: "view" } }

// A member sees the workspace's settings as they're set, and the monthly costs when they see the Overview.
export const BuyerMember = meta.story({
  ...buyer,
  parameters: { ...buyer.parameters, permissions: overviewMember },
  args: { permissions: overviewMember, org: { ...buyerArgs.org, timeZone: null } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("textbox", { name: "Company website" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Invite" })).toBeNull()
    const restock = canvas.getByRole("region", { name: "Restock" })
    await expect(within(restock).getByText("Sales period").nextElementSibling).toHaveTextContent("90 days")
    await expect(within(restock).getByText("Lead time").nextElementSibling).toHaveTextContent("60 days")
    await expect(canvas.getByRole("region", { name: "Time zone" })).toHaveTextContent(
      `Automatic, ${timeZoneLabel("America/New_York")}`
    )
    const monthly = canvas.getByRole("region", { name: "Monthly costs" })
    await expect(within(monthly).queryByRole("button", { name: "Add cost" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Manage Shopify" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Manage eBay" })).toBeNull()
    await expect(canvas.getAllByText("Connected")).toHaveLength(3)
    await expect(canvas.queryByRole("button", { name: "Add address" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Delete workspace" })).toBeNull()
  }
})

// Monthly costs feed the Overview's profit, so a member who can't see it doesn't see them.
export const BuyerMemberWithoutOverview = meta.story({
  ...buyer,
  parameters: { ...buyer.parameters, permissions: member },
  args: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("region", { name: "Monthly costs" })).toBeNull()
    await expect(canvas.getByRole("region", { name: "Restock" })).toBeVisible()
  }
})

const supplierArgs: Partial<Args> = {
  kind: "supplier",
  org: { ...buyerArgs.org, name: workspaces.supplier.name, timeZone: null },
  person: {
    firstName: "Mei",
    lastName: "Chen",
    position: "Sales manager",
    company: "Lotus Manufacturing",
    locale: "zh-CN"
  },
  profile: {
    website: "https://lotus.example.com",
    contactName: "Mei Chen",
    contactEmail: "mei@lotus.example.com",
    phoneNumber: null
  },
  linked: [],
  saved: supplierContacts.map((saved) => contact(saved)),
  team: { members: [team.members[0]!], invitations: [] },
  owned: { handOver: [workspaces.supplier.name], closing: [] }
}

// A supplier keeps its contact details for buyers and its pickup addresses; it has no stores or restock.
export const Supplier = meta.story({
  ...supplier,
  args: supplierArgs,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Profile",
      "Language",
      "Team",
      "Supplier profile",
      "Pickup addresses",
      "Delete"
    ])
    await expect(canvas.getByRole("combobox", { name: "Language" })).toHaveTextContent("简体中文")
    const profile = canvas.getByRole("region", { name: "Supplier profile" })
    await expect(within(profile).getByRole("textbox", { name: "Contact name" })).toHaveValue("Mei Chen")
    await userEvent.type(within(profile).getByRole("textbox", { name: "Phone" }), "+86 188 6161 3263")
    await userEvent.click(within(profile).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toMatchObject({ action: "supplier.profile", data: { phoneNumber: "+86 188 6161 3263" } })
    const pickups = canvas.getByRole("region", { name: "Pickup addresses" })
    await expect(pickups).toHaveTextContent("Where carriers collect your cartons")
    await expect(within(pickups).getByText("Add a phone number to use it on shipments")).toBeVisible()
    // An owner whose workspace others use hands it over before deleting the account.
    await expect(canvas.getByRole("region", { name: "Delete" })).toHaveTextContent("Delete workspace")
  }
})

export const SupplierMember = meta.story({
  ...supplier,
  parameters: { ...supplier.parameters, permissions: member },
  args: { ...supplierArgs, permissions: member, profile: { ...supplierArgs.profile!, website: null } },
  play: async ({ canvas }) => {
    const profile = canvas.getByRole("region", { name: "Supplier profile" })
    await expect(within(profile).queryByRole("textbox")).toBeNull()
    await expect(within(profile).getByText("Contact email").nextElementSibling).toHaveTextContent(
      "mei@lotus.example.com"
    )
    await expect(within(profile).getByText("Website").nextElementSibling).toHaveTextContent("—")
  }
})

// A forwarder keeps its profile, team and addresses.
export const Forwarder = meta.story({
  ...forwarder,
  args: {
    kind: "forwarder",
    org: { ...buyerArgs.org, name: workspaces.forwarder.name },
    person: null,
    profile: null,
    linked: [],
    saved: [
      contact({ ...buyerContacts[0]!, name: "Shenzhen warehouse", address: baylineShenzhen, shopifyLocationId: null })
    ],
    team: { members: [team.members[0]!], invitations: [] }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Profile",
      "Language",
      "Team",
      "Addresses",
      "Delete"
    ])
    // Without a saved profile, the name starts empty and the company is the workspace's.
    await expect(canvas.getByRole("textbox", { name: "First name" })).toHaveValue("")
    await expect(canvas.getByRole("textbox", { name: "Company" })).toHaveValue("Bayline Freight")
    await expect(canvas.getByRole("combobox", { name: "Language" })).toHaveTextContent("System (English)")
    await expect(canvas.getByText("Shenzhen warehouse")).toBeVisible()
    await expect(canvas.getByText("1 person")).toBeVisible()
  }
})
