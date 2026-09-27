import { and, eq, isNull } from "drizzle-orm"
import { CheckCircle2, Clock, TimerOff } from "lucide-react"
import { ActionButton } from "@/components/actions"
import { EmptyState, PageHeader } from "@/components/common"
import { EditSupplier, InviteSupplier, InviteSupplierByEmail } from "@/components/supplier-actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { db } from "@/db"
import { supplierProfiles, suppliers } from "@/db/schema"
import { requireBuyer, session } from "@/server/auth"
import { sx } from "@/styles/sprinkles.css"

// Each supplier, with its contact details: the buyer's until the supplier joins, then the supplier's own.
async function loadSuppliers(orgId: string) {
  const rows = await db()
    .select({ supplier: suppliers, profile: supplierProfiles })
    .from(suppliers)
    .leftJoin(supplierProfiles, eq(supplierProfiles.orgId, suppliers.supplierOrgId))
    .where(and(eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
  const now = Date.now()
  return rows.map(({ supplier, profile }) => {
    const source = supplier.supplierOrgId ? profile : supplier
    return {
      ...supplier,
      contact: {
        website: source?.website ?? null,
        contactName: source?.contactName ?? null,
        contactEmail: source?.contactEmail ?? null,
        phoneNumber: source?.phoneNumber ?? null
      },
      expired: supplier.expiresAt !== null && supplier.expiresAt.getTime() < now
    }
  })
}

// "Wei Chen, wei@supplier.example, +86 512 5555 0100, supplier.example", leaving out what isn't known.
function contactSummary(contact: {
  website: string | null
  contactName: string | null
  contactEmail: string | null
  phoneNumber: string | null
}) {
  const website = contact.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return [contact.contactName, contact.contactEmail, contact.phoneNumber, website].filter(Boolean).join(", ")
}

function leadTimeSummary(local: number | null, amazon: number | null) {
  if (local === null && amazon === null) {
    return "Lead time not set; restock uses its default"
  }
  const parts = []
  if (local !== null) {
    parts.push(`${local} days to your locations`)
  }
  if (amazon !== null) {
    parts.push(`${amazon} days to Amazon`)
  }
  return `Lead time: ${parts.join(", ")}`
}

export default async function SuppliersPage() {
  const s = await session()
  requireBuyer(s)
  const rows = await loadSuppliers(s.org.id)

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Everyone you buy from, as named in Shopify’s Supplier field. Send any of them POs; invite them to share POs, cartons and labels in their own workspace."
      />
      <Card>
        <CardHeader>
          <CardTitle>Your suppliers</CardTitle>
          {s.role !== "owner" && <CardDescription>Only workspace owners can add or invite suppliers.</CardDescription>}
          {s.role === "owner" && (
            <CardAction>
              <InviteSupplier />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <ItemGroup className={sx({ gap: 2 })}>
              {rows.map((row) => (
                <Item key={row.id} variant="outline">
                  <ItemMedia>
                    <Avatar>
                      <AvatarFallback>{row.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{row.name}</ItemTitle>
                    {row.email && <ItemDescription>{row.email}</ItemDescription>}
                    {row.shopifySupplierName && row.shopifySupplierName !== row.name && (
                      <ItemDescription>Company name: {row.shopifySupplierName}</ItemDescription>
                    )}
                    {contactSummary(row.contact) && <ItemDescription>{contactSummary(row.contact)}</ItemDescription>}
                    <ItemDescription>{leadTimeSummary(row.leadTimeDays, row.amazonLeadTimeDays)}</ItemDescription>
                  </ItemContent>
                  <ItemActions className={sx({ flexWrap: "wrap" })}>
                    {row.supplierOrgId && (
                      <Badge variant="outline">
                        <CheckCircle2 data-icon="inline-start" />
                        Joined
                      </Badge>
                    )}
                    {!row.supplierOrgId && !row.invitationHash && (
                      <>
                        <Badge variant="outline">Not invited</Badge>
                        {s.role === "owner" && <InviteSupplierByEmail id={row.id} name={row.name} email={row.email} />}
                      </>
                    )}
                    {!row.supplierOrgId && row.invitationHash && (
                      <div className={sx({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 })}>
                        {row.expired ? (
                          <Badge variant="outline">
                            <TimerOff data-icon="inline-start" />
                            Invitation expired
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock data-icon="inline-start" />
                            Invited
                          </Badge>
                        )}
                        {s.role === "owner" && (
                          <ActionButton
                            action="supplier.resend"
                            data={{ id: row.id }}
                            variant="outline"
                            size="sm"
                            successMessage={`Invitation sent to ${row.email}`}
                          >
                            Resend invitation
                          </ActionButton>
                        )}
                      </div>
                    )}
                    <EditSupplier
                      id={row.id}
                      name={row.name}
                      shopifySupplierName={row.shopifySupplierName}
                      leadTimeDays={row.leadTimeDays}
                      amazonLeadTimeDays={row.amazonLeadTimeDays}
                      contact={row.contact}
                      joined={row.supplierOrgId !== null}
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <EmptyState title="No suppliers yet" description="Invite your first supplier to get started." />
          )}
        </CardContent>
      </Card>
    </>
  )
}
