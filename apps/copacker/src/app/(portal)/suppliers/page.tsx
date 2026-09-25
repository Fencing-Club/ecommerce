import { eq } from "drizzle-orm"
import { CheckCircle2, Clock } from "lucide-react"
import { EmptyState, PageHeader } from "@/components/common"
import { SupplierForm } from "@/components/settings-forms"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { requireBuyer, session } from "@/server/auth"

export default async function SuppliersPage() {
  const s = await session()
  requireBuyer(s)
  const rows = await db().select().from(suppliers).where(eq(suppliers.buyerOrgId, s.org.id))

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Give your suppliers a shared workspace for purchase orders, cartons, and labels."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Your suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length ? (
              <ItemGroup className="gap-2">
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
                        <Badge variant="secondary">
                          <Clock data-icon="inline-start" />
                          Invitation pending
                        </Badge>
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
        <Card className="self-start">
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
