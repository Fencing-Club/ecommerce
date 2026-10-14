import { money } from "@repo/aisle"
import { eq } from "drizzle-orm"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import { AmazonAdsSettings } from "@/components/amazon-ads"
import { PageHeader } from "@/components/common"
import { DangerZone } from "@/components/danger-zone"
import { ExcludedOrderTags } from "@/components/excluded-order-tags"
import { Integrations } from "@/components/integrations"
import { DetailRow, InventoryLocations } from "@/components/inventory-locations"
import { InventorySyncRow } from "@/components/inventory-sync"
import { MonthlyCosts } from "@/components/monthly-costs"
import { ProfileForm } from "@/components/profile-form"
import { OrdersSyncRow } from "@/components/sales-orders"
import { SavedAddresses } from "@/components/saved-addresses"
import { LanguageForm, RestockSettingsForm, SupplierProfileForm, TimeZoneForm } from "@/components/settings-forms"
import { TeamSettings } from "@/components/team-settings"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/db"
import { connections, contacts, profiles, supplierProfiles } from "@/db/schema"
import { isLocale } from "@/i18n/locales"
import { systemLocale } from "@/i18n/request"
import { can, isAdmin } from "@/lib/access"
import { timeZoneLabel, timeZones } from "@/lib/time-zone"
import { amazonAdsApp } from "@/server/amazon-ads-client"
import { session } from "@/server/auth"
import { amazonStore, ebayUsername, shopifyStoreName } from "@/server/connected-accounts"
import { amazonSelfAuthEnabled, ebayApp } from "@/server/connections"
import { ownedWorkspaces } from "@/server/deletion"
import { readLocationMappings } from "@/server/inventory-location-settings"
import { listMonthlyCosts, monthlyCostChannels, type MonthlyCost } from "@/server/monthly-costs"
import { reportingCurrency } from "@/server/overview-sales"
import { restockSettings } from "@/server/restock-report"
import { salesHistoryDays } from "@/server/sales-orders"
import { shopifyOrderTags, untaggedShopifyOrders } from "@/server/shopify-tags"
import { storeTimeZone } from "@/server/store-time-zone"
import { teamOf } from "@/server/team"

export async function generateMetadata() {
  const t = await getTranslations("settings")
  return { title: t("title") }
}

// The person's own profile first, then the workspace's settings, each as a section: its title and a short description
// on the left, its cards on the right, stacked on smaller screens.
export default async function Settings() {
  const s = await session()
  // The viewer's computer's zone, as their browser last reported it.
  const computerZone = await storeTimeZone({ timeZone: null })
  const buyer = s.org.kind === "buyer"
  const supplier = s.org.kind === "supplier"
  // Owners and admins change the workspace's settings; everyone else sees them as they're set.
  const admin = isAdmin(s)
  // Monthly costs feed the Overview's profit, so they're for those who can see it.
  const finances = buyer && can(s, "overview")
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
    systemLocale(),
    getTranslations("settings"),
    getFormatter(),
    getLocale()
  ])
  // A monthly cost's day, such as "Jan 5, 2026".
  const date = (day: string) =>
    format.dateTime(new Date(`${day}T00:00:00Z`), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  return (
    <>
      <PageHeader title={t("title")} />

      <div className="flex w-full max-w-5xl flex-col divide-y">
        <Section id="profile" title={t("profile.title")} description={s.user.email}>
          <ProfileForm
            profile={{
              firstName: person?.firstName ?? "",
              lastName: person?.lastName ?? "",
              position: person?.position ?? "",
              company: person?.company || s.org.name,
              ...(buyer && admin && { website: profile?.website ?? "" })
            }}
          />
        </Section>

        <Section id="language" title={t("language.title")} description={t("language.description")}>
          <LanguageForm locale={isLocale(person?.locale) ? person.locale : null} systemLocale={computerLocale} />
        </Section>

        <Section id="team" title={t("team.title")} description={t("team.description", { workspace: s.org.name })}>
          <TeamSettings
            {...team}
            admin={admin}
            owner={s.role === "owner"}
            you={s.user.id}
            workspace={s.org.name}
            kind={s.org.kind}
          />
        </Section>

        {buyer && (
          <Section id="integrations" title={t("integrations.title")} description={t("integrations.description")}>
            <Integrations
              admin={admin}
              amazonSelfAuth={amazonSelfAuthEnabled()}
              ebayAvailable={ebayApp() !== null}
              shopify={
                shopifyAccount
                  ? { account: account(shopName, shopifyAccount.externalId), externalId: shopifyAccount.externalId }
                  : null
              }
              amazon={
                amazonAccount
                  ? {
                      account: amazon?.name ?? "Amazon",
                      externalId: amazonAccount.externalId,
                      marketplaces: amazon?.marketplaces ?? null
                    }
                  : null
              }
              shopifySettings={
                <>
                  <OrdersSyncRow source="shopify" />
                  <InventorySyncRow provider="shopify" />
                  <InventoryLocations />
                  <ExcludedOrderTags tags={s.org.excludedShopifyTags} suggestions={orderTags} copying={copyingTags} />
                </>
              }
              ebay={
                ebayAccount
                  ? { account: ebayName ?? ebayAccount.externalId, externalId: ebayName ?? ebayAccount.externalId }
                  : null
              }
              ebaySettings={<OrdersSyncRow source="ebay" />}
              amazonSettings={
                <>
                  <OrdersSyncRow source="amazon" />
                  <AmazonAdsSettings available={amazonAdsApp() !== null} />
                  <InventorySyncRow provider="amazon" />
                  <DetailRow title={t("integrations.marketplaces")}>
                    {amazon
                      ? amazon.marketplaces.join(", ") || t("integrations.noMarketplaces")
                      : t("integrations.marketplacesUnavailable")}
                  </DetailRow>
                </>
              }
            />
          </Section>
        )}

        {buyer && (
          <Section id="restock" title={t("restock.title")} description={t("restock.description")}>
            {admin ? (
              <RestockSettingsForm salesDays={restock.days} leadTimeDays={restock.leadTimeDays} />
            ) : (
              <Values
                values={[
                  { label: t("restock.salesPeriod"), value: t("restock.days", { count: restock.days }) },
                  { label: t("restock.leadTime"), value: t("restock.days", { count: restock.leadTimeDays }) }
                ]}
              />
            )}
          </Section>
        )}

        {buyer && (
          <Section id="time-zone" title={t("timeZone.title")} description={t("timeZone.description")}>
            {admin ? (
              <TimeZoneForm
                timeZone={s.org.timeZone}
                computerZone={computerZone}
                zones={timeZones().map((zone) => ({ value: zone, label: timeZoneLabel(zone) }))}
              />
            ) : (
              <Values
                values={[
                  {
                    label: t("timeZone.label"),
                    value: s.org.timeZone
                      ? timeZoneLabel(s.org.timeZone)
                      : t("timeZone.automaticZone", { zone: timeZoneLabel(computerZone) })
                  }
                ]}
              />
            )}
          </Section>
        )}

        {finances && (
          <Section id="monthly-costs" title={t("monthlyCosts.title")} description={t("monthlyCosts.description")}>
            <MonthlyCosts
              costs={costs.map((cost) => ({
                id: cost.id,
                name: cost.name,
                amount: money(cost.amountMinor, cost.currency, locale),
                details: costDetails(cost, t, date)
              }))}
              currency={currency}
              admin={admin}
            />
          </Section>
        )}

        {supplier && (
          <Section
            id="supplier-profile"
            title={t("supplierProfile.title")}
            description={t("supplierProfile.description")}
          >
            {admin ? (
              <SupplierProfileForm
                contactName={profile?.contactName ?? ""}
                contactEmail={profile?.contactEmail ?? ""}
                phoneNumber={profile?.phoneNumber ?? ""}
                website={profile?.website ?? ""}
              />
            ) : (
              <Values
                values={[
                  { label: t("supplierProfile.contactName"), value: profile?.contactName || "—" },
                  { label: t("supplierProfile.contactEmail"), value: profile?.contactEmail || "—" },
                  { label: t("supplierProfile.phone"), value: profile?.phoneNumber || "—" },
                  { label: t("supplierProfile.website"), value: profile?.website || "—" }
                ]}
              />
            )}
          </Section>
        )}

        <Section
          id="addresses"
          title={supplier ? t("addresses.pickupTitle") : t("addresses.title")}
          description={supplier ? t("addresses.pickupDescription") : t("addresses.description")}
        >
          <SavedAddresses
            // Addresses saved for a forwarder or a supplier live with that partner on the Partners page. Older
            // forwarder addresses, saved before forwarders had their own page, stay here to copy over and delete.
            contacts={saved.filter(
              (contact) => !contact.supplierId && (contact.kind !== "forwarder" || !contact.forwarderId)
            )}
            supplier={supplier}
            locations={ownLocations}
            admin={admin}
          />
        </Section>

        <Section id="delete" title={t("delete.title")} description={t("delete.description")}>
          <DangerZone
            workspace={s.org.name}
            kind={s.org.kind}
            owner={s.role === "owner"}
            email={s.user.email}
            handOver={owned.handOver.map((workspace) => workspace.name)}
            closing={owned.closing.map((workspace) => workspace.name)}
          />
        </Section>
      </div>
    </>
  )
}

function Section({
  id,
  title,
  description,
  children
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-20 gap-4 py-8 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={`${id}-title`} className="font-semibold">
          {title}
        </h2>
        <p className="text-sm break-words text-muted-foreground">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  )
}

// A store's name and account id, once when they're the same: "Fencing Club, fencing-club.myshopify.com".
function account(name: string | null, externalId: string) {
  return name && name !== externalId ? `${name}, ${externalId}` : externalId
}

// Settings only owners and admins change, as the rest of the team sees them.
function Values({ values }: { values: Array<{ label: string; value: string }> }) {
  return (
    <Card>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          {values.map(({ label, value }) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

// Which channel a monthly cost is for and when it's paid, such as "Amazon, since Jan 5, 2026".
function costDetails(
  cost: MonthlyCost,
  t: Awaited<ReturnType<typeof getTranslations<"settings">>>,
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
