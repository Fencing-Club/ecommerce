import { and, eq, isNull } from "drizzle-orm"
import { CheckCircle2, Clock, TimerOff } from "lucide-react"
import { ActionButton } from "@/components/actions"
import { EmptyState, PageHeader } from "@/components/common"
import { EditSupplier, InviteSupplier, RemoveSupplier } from "@/components/supplier-actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { requireBuyer, session } from "@/server/auth"
import { sx } from "@/styles/sprinkles.css"

async function loadSuppliers(orgId: string) {
  const rows = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
  const now = Date.now()
  return rows.map((row) => ({ ...row, expired: row.expiresAt !== null && row.expiresAt.getTime() < now }))
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
        description="Give your suppliers a shared workspace for purchase orders, cartons, and labels."
      />
      <Card>
        <CardHeader>
          <CardTitle>Your suppliers</CardTitle>
          {s.role !== "owner" && (
            <CardDescription>Only workspace owners can invite or remove suppliers.</CardDescription>
          )}
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
                    <ItemDescription>
                      {row.email}
                      <br />
                      {leadTimeSummary(row.leadTimeDays, row.amazonLeadTimeDays)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className={sx({ flexWrap: "wrap" })}>
                    {row.supplierOrgId ? (
                      <Badge variant="outline">
                        <CheckCircle2 data-icon="inline-start" />
                        Connected
                      </Badge>
                    ) : (
                      <div className={sx({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 })}>
                        {row.expired ? (
                          <Badge variant="outline">
                            <TimerOff data-icon="inline-start" />
                            Invitation expired
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock data-icon="inline-start" />
                            Invitation pending
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
                    />
                    {s.role === "owner" && (
                      <RemoveSupplier id={row.id} name={row.name} joined={row.supplierOrgId !== null} />
                    )}
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
