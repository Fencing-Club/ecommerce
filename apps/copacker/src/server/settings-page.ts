import { money } from "@repo/aisle"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { eq } from "drizzle-orm"
import { createFormatter } from "use-intl"
import { db } from "@/db"
import { connections, contacts, profiles, supplierProfiles } from "@/db/schema"
import { negotiateLocale } from "@/i18n/locales"
import { can, isAdmin } from "@/lib/access"
import { amazonAdsApp } from "@/server/amazon-ads-client"
import { session } from "@/server/auth"
import { amazonStore, ebayUsername, shopifyStoreName } from "@/server/connected-accounts"
import { amazonSelfAuthEnabled, ebayApp } from "@/server/connections"
import { ownedWorkspaces } from "@/server/deletion"
import { readLocationMappings } from "@/server/inventory-location-settings"
import { localization } from "@/server/localization"
import type { MonthlyCost } from "@/server/monthly-costs"
import { listMonthlyCosts, monthlyCostChannels } from "@/server/monthly-costs"
import { reportingCurrency } from "@/server/overview-sales"
import { restockSettings } from "@/server/restock-report"
import { salesHistoryDays } from "@/server/sales-orders"
import { shopifyOrderTags, untaggedShopifyOrders } from "@/server/shopify-tags"
import { storeTimeZone } from "@/server/store-time-zone"
import { teamOf } from "@/server/team"
import { serverTranslator } from "@/server/translation"
export async function settingsPage(_input: { query: Record<string, string | string[]> }) {
  const s = await session()
  // The viewer's computer's zone, as their browser last reported it.
  const computerZone = await storeTimeZone({ timeZone: null })
  const buyer = s.org.kind === "buyer"
  const supplier = s.org.kind === "supplier"
  // Owners and admins change the workspace's settings; everyone else sees them as they're set.
  const admin = isAdmin(s)
  // Monthly costs feed the Overview's profit, so they're for those who can see it.
  const finances = buyer && can(s, "overview") && can(s, "prices")
  const restock = restockSettings(s.org)
  const [linked, saved, [profile], costs, currency, team] = await Promise.all([
    db()
      .select({ provider: connections.provider, externalId: connections.externalId })
      .from(connections)
      .where(eq(connections.orgId, s.org.id)),
    db().select().from(contacts).where(eq(contacts.orgId, s.org.id)),
    db().select().from(supplierProfiles).where(eq(supplierProfiles.orgId, s.org.id)),
    finances ? listMonthlyCosts(s.org.id) : Promise.resolve([]),
    finances ? reportingCurrency(s.org.id) : Promise.resolve("USD"),
    // Invitations expire on a day in the store's time zone, or the viewer's when it's automatic.
    teamOf({ id: s.org.id, timeZone: s.org.timeZone ?? computerZone })
  ])

  const shopifyAccount = linked.find((c) => c.provider === "shopify")
  const amazonAccount = linked.find((c) => c.provider === "amazon")
  const ebayAccount = linked.find((c) => c.provider === "ebay")
  const [shopName, amazon, ebayName, orderTags, copyingTags] = await Promise.all([
    shopifyAccount ? shopifyStoreName(s.org.id, shopifyAccount.externalId) : null,
    amazonAccount ? amazonStore(s.org.id, amazonAccount.externalId) : null,
    ebayAccount ? ebayUsername(s.org.id, ebayAccount.externalId) : null,
    buyer && shopifyAccount && admin ? shopifyOrderTags(s.org.id) : [],
    buyer && shopifyAccount && admin ? untaggedShopifyOrders(s.org.id, salesHistoryDays) : false
  ])
  // Amazon's consent page doesn't offer a draft app, so the seller can connect with a self-authorization instead.
  // Delivery addresses can be linked to one of the store's own Shopify locations.
  const ownLocations = buyer
    ? (await readLocationMappings(s)).locations
        .filter((location) => location.classification === "merchant")
        .map((location) => ({ id: location.locationId, name: location.name }))
    : []

  const [[person], owned, computerLocale, t, format, locale] = await Promise.all([
    db().select().from(profiles).where(eq(profiles.userId, s.user.id)),
    // What deleting the account would do to the workspaces the person owns.
    ownedWorkspaces(s.user.id),
    negotiateLocale(getRequestHeaders().get("accept-language")),
    serverTranslator("settings"),
    localization().then(createFormatter),
    localization().then((config) => config.locale)
  ])
  // A monthly cost's day, such as "Jan 5, 2026".
  const date = (day: string) =>
    format.dateTime(new Date(`${day}T00:00:00Z`), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  return {
    s: {
      org: {
        id: s.org.id,
        name: s.org.name,
        kind: s.org.kind,
        timeZone: s.org.timeZone,
        excludedShopifyTags: s.org.excludedShopifyTags
      },
      user: { id: s.user.id, email: s.user.email },
      role: s.role
    },
    computerZone,
    buyer,
    supplier,
    admin,
    finances,
    restock,
    saved: saved.filter((contact) => !contact.supplierId && (contact.kind !== "forwarder" || !contact.forwarderId)),
    profile: profile
      ? {
          website: profile.website,
          contactName: profile.contactName,
          contactEmail: profile.contactEmail,
          phoneNumber: profile.phoneNumber
        }
      : null,
    costs: costs.map((cost) => ({
      id: cost.id,
      name: cost.name,
      amount: money(cost.amountMinor, cost.currency, locale),
      details: costDetails(cost, t, date)
    })),
    currency,
    team,
    shopifyAccount,
    amazonAccount,
    ebayAccount,
    shopName,
    amazon,
    ebayName,
    orderTags,
    copyingTags,
    ownLocations,
    person: person
      ? {
          firstName: person.firstName,
          lastName: person.lastName,
          position: person.position,
          company: person.company,
          locale: person.locale
        }
      : null,
    owned: {
      handOver: owned.handOver.map((row) => ({ name: row.name })),
      closing: owned.closing.map((row) => ({ name: row.name }))
    },
    computerLocale,
    amazonAdsAvailable: amazonAdsApp() !== null,
    amazonSelfAuth: amazonSelfAuthEnabled(),
    ebayAvailable: ebayApp() !== null
  }
}
function costDetails(
  cost: MonthlyCost,
  t: Awaited<ReturnType<typeof serverTranslator<"settings">>>,
  date: (day: string) => string
) {
  const channel = cost.channel ? monthlyCostChannels[cost.channel] : t("monthlyCosts.allChannels")
  if (cost.startsOn && cost.endsOn) {
    return t("monthlyCosts.between", { channel, start: date(cost.startsOn), end: date(cost.endsOn) })
  }
  if (cost.startsOn) {
    return t("monthlyCosts.since", { channel, start: date(cost.startsOn) })
  }
  return cost.endsOn ? t("monthlyCosts.until", { channel, end: date(cost.endsOn) }) : channel
}
