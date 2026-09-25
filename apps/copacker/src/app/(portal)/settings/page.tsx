import { eq } from "drizzle-orm"
import { CheckCircle2 } from "lucide-react"
import { PageHeader } from "@/components/common"
import { DisconnectButton } from "@/components/disconnect-button"
import { TextField } from "@/components/form-fields"
import { SavedAddresses } from "@/components/saved-addresses"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { db } from "@/db"
import { connections, contacts } from "@/db/schema"
import { session } from "@/server/auth"
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
  const [linked, saved] = await Promise.all([
    db()
      .select({ provider: connections.provider, externalId: connections.externalId })
      .from(connections)
      .where(eq(connections.orgId, s.org.id)),
    db().select().from(contacts).where(eq(contacts.orgId, s.org.id))
  ])

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
                          <div>
                            <Button type="submit">Connect {provider.action}</Button>
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

      <SavedAddresses contacts={saved} />
    </>
  )
}
