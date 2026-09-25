import { eq } from "drizzle-orm"
import { CheckCircle2, Clock, TimerOff } from "lucide-react"
import { ActionButton } from "@/components/actions"
import { EmptyState, PageHeader } from "@/components/common"
import { SupplierForm } from "@/components/settings-forms"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { requireBuyer, session } from "@/server/auth"
import { sx } from "@/styles/sprinkles.css"

async function loadSuppliers(orgId: string) {
  const rows = await db().select().from(suppliers).where(eq(suppliers.buyerOrgId, orgId))
  const now = Date.now()
  return rows.map((row) => ({ ...row, expired: row.expiresAt !== null && row.expiresAt.getTime() < now }))
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
      <div className={sx({ display: "grid", gap: 6, gridTemplateColumns: { xl: "mainAsideWide" } })}>
        <Card>
          <CardHeader>
            <CardTitle>Your suppliers</CardTitle>
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
                      <ItemDescription>{row.email}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
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
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            ) : (
              <EmptyState title="No suppliers yet" description="Invite your first supplier to get started." />
            )}
          </CardContent>
        </Card>
        <Card className={sx({ alignSelf: "flex-start" })}>
          <CardHeader>
            <CardTitle>Invite a supplier</CardTitle>
            {s.role !== "owner" && <CardDescription>Only workspace owners can invite suppliers.</CardDescription>}
          </CardHeader>
          {s.role === "owner" && (
            <CardContent>
              <SupplierForm />
            </CardContent>
          )}
        </Card>
      </div>
    </>
  )
}
