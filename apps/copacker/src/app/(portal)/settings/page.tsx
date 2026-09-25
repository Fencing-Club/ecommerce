import { eq } from "drizzle-orm"
import { CheckCircle2 } from "lucide-react"
import { AmazonSelfAuthorize } from "@/components/amazon-self-authorize"
import { PageHeader } from "@/components/common"
import { DisconnectButton } from "@/components/disconnect-button"
import { TextField } from "@/components/form-fields"
import { SavedAddresses } from "@/components/saved-addresses"
import { SupplierProfileForm } from "@/components/settings-forms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { db } from "@/db"
import { connections, contacts, supplierProfiles } from "@/db/schema"
import { session } from "@/server/auth"
import { readLocationMappings } from "@/server/inventory-location-settings"
import { pushToBottom } from "./page.css"
import { sx } from "@/styles/sprinkles.css"

const providers = [
  {
    id: "shopify" as const,
    title: "Shopify",
    action: "Shopify",
    description: "Connect your catalog, supplier SKUs, and product costs."
  },
  {
    id: "amazon" as const,
    title: "Amazon Seller Central",
    action: "Amazon",
    description: "Connect the seller account used to create US AWD shipments."
  }
]

export default async function Settings() {
  const s = await session()
  const [linked, saved, [profile]] = await Promise.all([
    db()
      .select({ provider: connections.provider, externalId: connections.externalId })
      .from(connections)
      .where(eq(connections.orgId, s.org.id)),
    db().select().from(contacts).where(eq(contacts.orgId, s.org.id)),
    db().select().from(supplierProfiles).where(eq(supplierProfiles.orgId, s.org.id))
  ])

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
                  <CardDescription>{connection?.externalId ?? provider.description}</CardDescription>
                  {connection && (
                    <CardAction>
                      <Badge variant="outline">
                        <CheckCircle2 data-icon="inline-start" />
                        Connected
                      </Badge>
                    </CardAction>
                  )}
                </CardHeader>
                {s.role === "owner" && (
                  <CardContent className={pushToBottom}>
                    {connection ? (
                      <DisconnectButton provider={provider.id} account={connection.externalId} />
                    ) : (
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
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {s.org.kind === "supplier" && (
        <Card>
          <CardHeader>
            <CardTitle>Supplier profile</CardTitle>
            <CardDescription>Your website and contact phone for buyers working with you.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.role === "owner" ? (
              <SupplierProfileForm website={profile?.website ?? ""} phoneNumber={profile?.phoneNumber ?? ""} />
            ) : (
              <p>{profile?.website ?? "No website saved"}</p>
            )}
          </CardContent>
        </Card>
      )}

      <SavedAddresses contacts={saved} supplier={s.org.kind === "supplier"} locations={ownLocations} />
    </>
  )
}
