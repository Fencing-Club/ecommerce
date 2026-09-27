import { money } from "@repo/aisle"
import { eq } from "drizzle-orm"
import { CheckCircle2 } from "lucide-react"
import type { Metadata } from "next"
import { ActionButton } from "@/components/actions"
import { AmazonSelfAuthorize } from "@/components/amazon-self-authorize"
import { PageHeader } from "@/components/common"
import { DisconnectButton } from "@/components/disconnect-button"
import { ExcludedOrderTags } from "@/components/excluded-order-tags"
import { TextField } from "@/components/form-fields"
import { InventoryLocations } from "@/components/inventory-locations"
import { AddMonthlyCost } from "@/components/monthly-costs"
import { SavedAddresses } from "@/components/saved-addresses"
import { BusinessProfileForm, SupplierProfileForm, TimeZoneForm } from "@/components/settings-forms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { db } from "@/db"
import { connections, contacts, supplierProfiles } from "@/db/schema"
import { timeZoneLabel, timeZones } from "@/lib/time-zone"
import { cn } from "@/lib/utils"
import { session } from "@/server/auth"
import { amazonStore, shopifyStoreName } from "@/server/connected-accounts"
import { readLocationMappings } from "@/server/inventory-location-settings"
import { listMonthlyCosts, monthlyCostChannels, type MonthlyCost } from "@/server/monthly-costs"
import { reportingCurrency } from "@/server/overview-sales"
import { salesHistoryDays } from "@/server/sales-orders"
import { shopifyOrderTags, untaggedShopifyOrders } from "@/server/shopify-tags"
import { storeTimeZone } from "@/server/store-time-zone"
import { pushToBottom } from "./page.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

export const metadata: Metadata = { title: "Settings" }

const providers = [
  {
    id: "shopify" as const,
    title: "Shopify",
    action: "Shopify",
    description: "Connect your catalog, supplier SKUs, and product costs."
  },
  {
    id: "amazon" as const,
    title: "Amazon",
    action: "Amazon",
    description: "Connect the seller account used to create US AWD shipments."
  }
]

export default async function Settings() {
  const s = await session()
  // The viewer's computer's zone, as their browser last reported it.
  const computerZone = await storeTimeZone({ timeZone: null })
  const buyer = s.org.kind === "buyer"
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
    buyer && shopifyAccount && s.role === "owner" ? shopifyOrderTags(s.org.id) : [],
    buyer && shopifyAccount && s.role === "owner" ? untaggedShopifyOrders(s.org.id, salesHistoryDays) : false
  ])
  const storeNames = { shopify: shopName, amazon: amazon?.name ?? null }
  // Amazon's consent page doesn't offer a draft app, so the seller can connect with a self-authorization instead.
  const amazonDraft = process.env.AMAZON_APP_DRAFT === "true"
  // Delivery addresses can be linked to one of the store's own Shopify locations.
  const ownLocations =
    s.org.kind === "buyer"
      ? (await readLocationMappings(s)).locations
          .filter((location) => location.classification === "merchant")
          .map((location) => ({ id: location.locationId, name: location.name }))
      : []

  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Connect your accounts and keep pickup and freight forwarder details close at hand."
      />

      {s.org.kind === "buyer" && (
        <div className={sx({ display: "grid", gap: 6, gridTemplateColumns: { md: "2" } })}>
          {providers.map((provider) => {
            const connection = linked.find((c) => c.provider === provider.id)
            return (
              <Card key={provider.id}>
                <CardHeader>
                  <CardTitle>{provider.title}</CardTitle>
                  <CardDescription>
                    {connection ? (storeNames[provider.id] ?? connection.externalId) : provider.description}
                  </CardDescription>
                  {connection && (
                    <CardAction>
                      <Badge variant="outline">
                        <CheckCircle2 data-icon="inline-start" />
                        Connected
                      </Badge>
                    </CardAction>
                  )}
                </CardHeader>
                {s.role === "owner" && connection && (
                  <>
                    <CardContent>
                      {provider.id === "shopify" && (
                        <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
                          <InventoryLocations />
                          <ExcludedOrderTags
                            tags={s.org.excludedShopifyTags}
                            suggestions={orderTags}
                            copying={copyingTags}
                          />
                        </div>
                      )}
                      {provider.id === "amazon" && (
                        <section className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
                          <h3 className={sx({ text: "sm", fontWeight: "medium" })}>Marketplaces</h3>
                          {amazon ? (
                            <ul className={sx({ display: "flex", flexDirection: "column", gap: 1, text: "sm" })}>
                              {amazon.marketplaces.map((label) => (
                                <li key={label}>{label}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className={sx({ text: "sm", color: "muted" })}>
                              Amazon didn’t say which marketplaces you sell in. Try again later.
                            </p>
                          )}
                        </section>
                      )}
                    </CardContent>
                    <CardFooter className={cn(pushToBottom, sx({ justifyContent: "space-between", gap: 3 }))}>
                      <span className={sx({ text: "xs", color: "muted", minWidth: 0 })}>{connection.externalId}</span>
                      <DisconnectButton provider={provider.id} account={connection.externalId} />
                    </CardFooter>
                  </>
                )}
                {s.role === "owner" && !connection && (
                  <CardContent className={pushToBottom}>
                    <form action={`/api/connections/${provider.id}`}>
                      <FieldGroup>
                        {provider.id === "shopify" && (
                          <TextField
                            label="Shopify store"
                            name="shop"
                            placeholder="your-store.myshopify.com"
                            description="Paste your Shopify admin link or enter your myshopify.com domain."
                            required
                          />
                        )}
                        <div className={sx({ display: "flex", flexWrap: "wrap", gap: 2 })}>
                          {provider.id === "amazon" && amazonDraft ? (
                            <AmazonSelfAuthorize />
                          ) : (
                            <Button type="submit">Connect {provider.action}</Button>
                          )}
                        </div>
                      </FieldGroup>
                    </form>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {s.org.kind === "buyer" && (
        <Card>
          <CardHeader>
            <CardTitle>Store time zone</CardTitle>
            <CardDescription>
              The Overview counts sales days and months from midnight in this time zone. Unless you choose one, it uses
              your computer’s.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.role === "owner" ? (
              <TimeZoneForm
                timeZone={s.org.timeZone}
                computerZone={computerZone}
                zones={timeZones().map((zone) => ({ value: zone, label: timeZoneLabel(zone) }))}
              />
            ) : (
              <p>{timeZoneLabel(s.org.timeZone ?? computerZone)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {buyer && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly costs</CardTitle>
            <CardDescription>
              Costs you pay every month that Shopify and Amazon don’t report, such as apps billed to a card. The
              Overview takes each month’s share off gross profit.
            </CardDescription>
            {s.role === "owner" && (
              <CardAction>
                <AddMonthlyCost currency={currency} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
            {costs.length > 0 ? (
              <ul className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
                {costs.map((cost) => (
                  <li
                    key={cost.id}
                    className={sx({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 3 })}
                  >
                    <span className={sx({ display: "flex", flexDirection: "column", minWidth: 0 })}>
                      <span className={sx({ text: "sm", fontWeight: "medium" })}>{cost.name}</span>
                      <span className={sx({ text: "xs", color: "muted" })}>{costDetails(cost)}</span>
                    </span>
                    <span className={sx({ display: "flex", alignItems: "center", gap: 3 })}>
                      <span className={sx({ text: "sm", fontVariantNumeric: "tabular" })}>
                        {money(cost.amountMinor, cost.currency)} a month
                      </span>
                      {s.role === "owner" && (
                        <ActionButton action="monthlyCost.delete" data={{ id: cost.id }} variant="outline" size="sm">
                          Remove<span className={srOnly}> {cost.name}</span>
                        </ActionButton>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={sx({ text: "sm", color: "muted" })}>No monthly costs yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {buyer && (
        <Card>
          <CardHeader>
            <CardTitle>Business details</CardTitle>
            <CardDescription>Printed at the top of your POs.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.role === "owner" ? (
              <BusinessProfileForm
                contactName={profile?.contactName ?? ""}
                contactEmail={profile?.contactEmail ?? ""}
                phoneNumber={profile?.phoneNumber ?? ""}
                website={profile?.website ?? ""}
                addressLine1={profile?.address?.addressLine1 ?? ""}
                addressLine2={profile?.address?.addressLine2 ?? ""}
                city={profile?.address?.city ?? ""}
                stateOrRegion={profile?.address?.stateOrRegion ?? ""}
                postalCode={profile?.address?.postalCode ?? ""}
                countryCode={profile?.address?.countryCode ?? ""}
              />
            ) : (
              <p>
                {[profile?.contactName, profile?.contactEmail, profile?.phoneNumber, profile?.website]
                  .filter(Boolean)
                  .join(", ") || "No business details saved"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {s.org.kind === "supplier" && (
        <Card>
          <CardHeader>
            <CardTitle>Supplier profile</CardTitle>
            <CardDescription>
              Your contact details, which buyers working with you see. Only you can change them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.role === "owner" ? (
              <SupplierProfileForm
                contactName={profile?.contactName ?? ""}
                contactEmail={profile?.contactEmail ?? ""}
                phoneNumber={profile?.phoneNumber ?? ""}
                website={profile?.website ?? ""}
              />
            ) : (
              <p>
                {[profile?.contactName, profile?.contactEmail, profile?.phoneNumber, profile?.website]
                  .filter(Boolean)
                  .join(", ") || "No contact details saved"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <SavedAddresses
        // Addresses saved for a forwarder live on the Forwarders page. Older forwarder addresses, saved before
        // forwarders had their own page, stay here to copy over and delete.
        contacts={saved.filter((contact) => contact.kind !== "forwarder" || !contact.forwarderId)}
        supplier={s.org.kind === "supplier"}
        locations={ownLocations}
      />
    </>
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
  const channel = cost.channel ? monthlyCostChannels[cost.channel] : "The whole business"
  if (cost.startsOn && cost.endsOn) {
    return `${channel}, ${date(cost.startsOn)} to ${date(cost.endsOn)}`
  }
  if (cost.startsOn) {
    return `${channel}, since ${date(cost.startsOn)}`
  }
  return cost.endsOn ? `${channel}, until ${date(cost.endsOn)}` : channel
}
