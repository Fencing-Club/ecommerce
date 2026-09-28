import { money } from "@repo/aisle"
import { eq } from "drizzle-orm"
import { CircleCheck, CircleDashed } from "lucide-react"
import type { Metadata } from "next"
import { AmazonSelfAuthorize } from "@/components/amazon-self-authorize"
import { PageHeader } from "@/components/common"
import { DisconnectButton } from "@/components/disconnect-button"
import { ExcludedOrderTags } from "@/components/excluded-order-tags"
import { RequiredMark } from "@/components/form-controls"
import { DetailRow, InventoryLocations } from "@/components/inventory-locations"
import { MonthlyCosts } from "@/components/monthly-costs"
import { ProfileForm } from "@/components/profile-form"
import { SavedAddresses } from "@/components/saved-addresses"
import { RestockSettingsForm, SupplierProfileForm, TimeZoneForm } from "@/components/settings-forms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { db } from "@/db"
import { connections, contacts, profiles, supplierProfiles } from "@/db/schema"
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

export const metadata: Metadata = { title: "Settings" }

// What connecting each store brings.
const providers = {
  shopify: { name: "Shopify", description: "Catalog, stock, sales and costs" },
  amazon: { name: "Amazon", description: "Sales, stock and AWD shipments" }
} as const

type Provider = keyof typeof providers

// The person's own profile first, then the workspace's settings, each as a section: its title and a short description
// on the left, its cards on the right, stacked on smaller screens.
export default async function Settings() {
  const s = await session()
  // The viewer's computer's zone, as their browser last reported it.
  const computerZone = await storeTimeZone({ timeZone: null })
  const buyer = s.org.kind === "buyer"
  const supplier = s.org.kind === "supplier"
  const owner = s.role === "owner"
  const restock = restockSettings(s.org)
  const [linked, saved, [profile], costs, currency] = await Promise.all([
    db()
      .select({ provider: connections.provider, externalId: connections.externalId })
      .from(connections)
      .where(eq(connections.orgId, s.org.id)),
    db().select().from(contacts).where(eq(contacts.orgId, s.org.id)),
    db().select().from(supplierProfiles).where(eq(supplierProfiles.orgId, s.org.id)),
    buyer ? listMonthlyCosts(s.org.id) : Promise.resolve([]),
    buyer ? reportingCurrency(s.org.id) : Promise.resolve("USD")
  ])

  const shopifyAccount = linked.find((c) => c.provider === "shopify")
  const amazonAccount = linked.find((c) => c.provider === "amazon")
  const [shopName, amazon, orderTags, copyingTags] = await Promise.all([
    shopifyAccount ? shopifyStoreName(s.org.id, shopifyAccount.externalId) : null,
    amazonAccount ? amazonStore(s.org.id, amazonAccount.externalId) : null,
    buyer && shopifyAccount && owner ? shopifyOrderTags(s.org.id) : [],
    buyer && shopifyAccount && owner ? untaggedShopifyOrders(s.org.id, salesHistoryDays) : false
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
              ...(buyer && owner && { website: profile?.website ?? "" })
            }}
          />
        </Section>

        {buyer && (
          <Section id="integrations" title="Integrations" description="Stores Copacker syncs with">
            {shopifyAccount ? (
              <ConnectedCard
                provider="shopify"
                account={account(shopName, shopifyAccount.externalId)}
                externalId={shopifyAccount.externalId}
                owner={owner}
              >
                <InventoryLocations />
                <ExcludedOrderTags tags={s.org.excludedShopifyTags} suggestions={orderTags} copying={copyingTags} />
              </ConnectedCard>
            ) : (
              <NotConnectedCard provider="shopify" owner={owner}>
                <form action="/api/connections/shopify">
                  <Card>
                    <IntegrationHeader provider="shopify" />
                    <CardContent>
                      <Field>
                        <FieldLabel htmlFor="shop">
                          <span>
                            Shopify store
                            <RequiredMark />
                          </span>
                        </FieldLabel>
                        <Input id="shop" name="shop" placeholder="your-store.myshopify.com" required />
                        <FieldDescription>Admin link or myshopify.com domain</FieldDescription>
                      </Field>
                    </CardContent>
                    <CardFooter className="justify-end">
                      <Button type="submit">Connect Shopify</Button>
                    </CardFooter>
                  </Card>
                </form>
              </NotConnectedCard>
            )}
            {amazonAccount ? (
              <ConnectedCard
                provider="amazon"
                account={account(amazon?.name ?? null, amazonAccount.externalId)}
                externalId={amazonAccount.externalId}
                owner={owner}
              >
                <DetailRow title="Marketplaces">
                  {amazon ? amazon.marketplaces.join(", ") || "—" : "Couldn’t load from Amazon"}
                </DetailRow>
              </ConnectedCard>
            ) : (
              <NotConnectedCard provider="amazon" owner={owner}>
                <Card>
                  <IntegrationHeader provider="amazon" />
                  <CardFooter className="justify-end">
                    {amazonDraft ? (
                      <AmazonSelfAuthorize />
                    ) : (
                      <form action="/api/connections/amazon">
                        <Button type="submit">Connect Amazon</Button>
                      </form>
                    )}
                  </CardFooter>
                </Card>
              </NotConnectedCard>
            )}
          </Section>
        )}

        {buyer && (
          <Section id="restock" title="Restock" description="Used by Restock and the Overview">
            {owner ? (
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
            {owner ? (
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

        {buyer && (
          <Section id="monthly-costs" title="Monthly costs" description="Costs Shopify and Amazon don’t report">
            <MonthlyCosts
              costs={costs.map((cost) => ({
                id: cost.id,
                name: cost.name,
                amount: money(cost.amountMinor, cost.currency),
                details: costDetails(cost)
              }))}
              currency={currency}
              owner={owner}
            />
          </Section>
        )}

        {supplier && (
          <Section id="supplier-profile" title="Supplier profile" description="Contact details buyers see">
            {owner ? (
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

function IntegrationHeader({ provider, children }: { provider: Provider; children?: React.ReactNode }) {
  return (
    <CardHeader>
      <CardTitle>{providers[provider].name}</CardTitle>
      <CardDescription>{providers[provider].description}</CardDescription>
      {children && <CardAction>{children}</CardAction>}
    </CardHeader>
  )
}

// A connected store: its account and status, the settings the owner can change, and Disconnect.
function ConnectedCard({
  provider,
  account: name,
  externalId,
  owner,
  children
}: {
  provider: Provider
  account: string
  externalId: string
  owner: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{providers[provider].name}</CardTitle>
        <CardDescription className="break-words">{name}</CardDescription>
        <CardAction>
          <Badge variant="outline">
            <CircleCheck data-icon="inline-start" className="text-success" />
            Connected
          </Badge>
        </CardAction>
      </CardHeader>
      {owner && (
        <>
          <CardContent className="flex flex-col divide-y">{children}</CardContent>
          <CardFooter className="justify-end">
            <DisconnectButton provider={provider} account={externalId} />
          </CardFooter>
        </>
      )}
    </Card>
  )
}

// A store that isn't connected: the owner's connect card, or for everyone else, that it isn't connected.
function NotConnectedCard({
  provider,
  owner,
  children
}: {
  provider: Provider
  owner: boolean
  children: React.ReactNode
}) {
  if (owner) {
    return children
  }
  return (
    <Card>
      <IntegrationHeader provider={provider}>
        <Badge variant="outline">
          <CircleDashed data-icon="inline-start" />
          Not connected
        </Badge>
      </IntegrationHeader>
    </Card>
  )
}

// Settings only the owner changes, as the rest of the team sees them.
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
