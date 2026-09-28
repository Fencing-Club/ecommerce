import { money } from "@repo/aisle"
import { eq } from "drizzle-orm"
import type { Metadata } from "next"
import { PageHeader } from "@/components/common"
import { ExcludedOrderTags } from "@/components/excluded-order-tags"
import { Integrations } from "@/components/integrations"
import { DetailRow, InventoryLocations } from "@/components/inventory-locations"
import { InventorySyncRow } from "@/components/inventory-sync"
import { MonthlyCosts } from "@/components/monthly-costs"
import { ProfileForm } from "@/components/profile-form"
import { OrdersSyncRow } from "@/components/sales-orders"
import { SavedAddresses } from "@/components/saved-addresses"
import { RestockSettingsForm, SupplierProfileForm, TimeZoneForm } from "@/components/settings-forms"
import { TeamSettings } from "@/components/team-settings"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/db"
import { connections, contacts, profiles, supplierProfiles } from "@/db/schema"
import { can, isAdmin } from "@/lib/access"
import { timeZoneLabel, timeZones } from "@/lib/time-zone"
import { session } from "@/server/auth"
import { amazonStore, shopifyStoreName } from "@/server/connected-accounts"
import { readLocationMappings } from "@/server/inventory-location-settings"
import { listMonthlyCosts, monthlyCostChannels, type MonthlyCost } from "@/server/monthly-costs"
import { reportingCurrency } from "@/server/overview-sales"
import { restockSettings } from "@/server/restock-report"
import { salesHistoryDays } from "@/server/sales-orders"
import { shopifyOrderTags, untaggedShopifyOrders } from "@/server/shopify-tags"
import { storeTimeZone } from "@/server/store-time-zone"
import { teamOf } from "@/server/team"

export const metadata: Metadata = { title: "Settings" }

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
  const [shopName, amazon, orderTags, copyingTags] = await Promise.all([
    shopifyAccount ? shopifyStoreName(s.org.id, shopifyAccount.externalId) : null,
    amazonAccount ? amazonStore(s.org.id, amazonAccount.externalId) : null,
    buyer && shopifyAccount && admin ? shopifyOrderTags(s.org.id) : [],
    buyer && shopifyAccount && admin ? untaggedShopifyOrders(s.org.id, salesHistoryDays) : false
  ])
  // Amazon's consent page doesn't offer a draft app, so the seller can connect with a self-authorization instead.
  const amazonDraft = process.env.AMAZON_APP_DRAFT === "true"
  // Delivery addresses can be linked to one of the store's own Shopify locations.
  const ownLocations = buyer
    ? (await readLocationMappings(s)).locations
        .filter((location) => location.classification === "merchant")
        .map((location) => ({ id: location.locationId, name: location.name }))
    : []

  const [person] = await db().select().from(profiles).where(eq(profiles.userId, s.user.id))
  return (
    <>
      <PageHeader title="Settings" />

      <div className="flex w-full max-w-5xl flex-col divide-y">
        <Section id="profile" title="Profile" description={s.user.email}>
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

        <Section id="team" title="Team" description={`People in ${s.org.name}`}>
          <TeamSettings {...team} admin={admin} you={s.user.id} workspace={s.org.name} kind={s.org.kind} />
        </Section>

        {buyer && (
          <Section id="integrations" title="Integrations" description="Stores Copacker syncs with">
            <Integrations
              admin={admin}
              amazonDraft={amazonDraft}
              shopify={
                shopifyAccount
                  ? { account: account(shopName, shopifyAccount.externalId), externalId: shopifyAccount.externalId }
                  : null
              }
              amazon={
                amazonAccount
                  ? {
                      account: account(amazon?.name ?? null, amazonAccount.externalId),
                      externalId: amazonAccount.externalId
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
              amazonSettings={
                <>
                  <OrdersSyncRow source="amazon" />
                  <InventorySyncRow provider="amazon" />
                  <DetailRow title="Marketplaces">
                    {amazon ? amazon.marketplaces.join(", ") || "—" : "Couldn’t load from Amazon"}
                  </DetailRow>
                </>
              }
            />
          </Section>
        )}

        {buyer && (
          <Section id="restock" title="Restock" description="Used by Restock and the Overview">
            {admin ? (
              <RestockSettingsForm salesDays={restock.days} leadTimeDays={restock.leadTimeDays} />
            ) : (
              <Values
                values={[
                  { label: "Sales period", value: `${restock.days} days` },
                  { label: "Lead time", value: `${restock.leadTimeDays} days` }
                ]}
              />
            )}
          </Section>
        )}

        {buyer && (
          <Section id="time-zone" title="Time zone" description="For days and months on the Overview">
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
                    label: "Store time zone",
                    value: s.org.timeZone ? timeZoneLabel(s.org.timeZone) : `Automatic, ${timeZoneLabel(computerZone)}`
                  }
                ]}
              />
            )}
          </Section>
        )}

        {finances && (
          <Section id="monthly-costs" title="Monthly costs" description="Costs Shopify and Amazon don’t report">
            <MonthlyCosts
              costs={costs.map((cost) => ({
                id: cost.id,
                name: cost.name,
                amount: money(cost.amountMinor, cost.currency),
                details: costDetails(cost)
              }))}
              currency={currency}
              admin={admin}
            />
          </Section>
        )}

        {supplier && (
          <Section id="supplier-profile" title="Supplier profile" description="Contact details buyers see">
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
                  { label: "Contact name", value: profile?.contactName || "—" },
                  { label: "Contact email", value: profile?.contactEmail || "—" },
                  { label: "Phone", value: profile?.phoneNumber || "—" },
                  { label: "Website", value: profile?.website || "—" }
                ]}
              />
            )}
          </Section>
        )}

        <Section
          id="addresses"
          title={supplier ? "Pickup addresses" : "Addresses"}
          description={supplier ? "Where carriers collect your cartons" : "Where purchase orders are delivered"}
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
function costDetails(cost: MonthlyCost) {
  const date = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    })
  const channel = cost.channel ? monthlyCostChannels[cost.channel] : "All channels"
  if (cost.startsOn && cost.endsOn) {
    return `${channel}, ${date(cost.startsOn)} to ${date(cost.endsOn)}`
  }
  if (cost.startsOn) {
    return `${channel}, since ${date(cost.startsOn)}`
  }
  return cost.endsOn ? `${channel}, until ${date(cost.endsOn)}` : channel
}
