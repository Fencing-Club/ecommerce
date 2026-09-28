import { and, eq, isNull, sql } from "drizzle-orm"
import { Clock, Globe, type LucideIcon, Mail, Phone, Timer, TimerOff, User } from "lucide-react"
import type { Metadata } from "next"
import { ActionButton } from "@/components/actions"
import { EmptyState, PageHeader } from "@/components/common"
import { EditSupplier, InviteSupplier, InviteSupplierByEmail } from "@/components/supplier-actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { db } from "@/db"
import { supplierProfiles, suppliers } from "@/db/schema"
import { cn } from "@/lib/utils"
import { requireBuyer, session } from "@/server/auth"
import { restockSettings } from "@/server/restock-report"
import * as styles from "./page.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

export const metadata: Metadata = { title: "Suppliers" }

// Each supplier, joined ones first, with its contact details: the buyer's until the supplier joins, then the supplier's own.
async function loadSuppliers(orgId: string) {
  const rows = await db()
    .select({ supplier: suppliers, profile: supplierProfiles })
    .from(suppliers)
    .leftJoin(supplierProfiles, eq(supplierProfiles.orgId, suppliers.supplierOrgId))
    .where(and(eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
    // Joined suppliers first, then the rest, each by name.
    .orderBy(sql`${suppliers.supplierOrgId} is null`, sql`lower(${suppliers.name})`)
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

type SupplierRow = Awaited<ReturnType<typeof loadSuppliers>>[number]

function leadTime(days: number | null, fallback: number) {
  return days === null ? `Lead time ${fallback} days (default)` : `Lead time ${days} days`
}

// One detail, such as the phone number, as an icon and its value.
function Detail({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <span className={sx({ display: "inline-flex", alignItems: "center", gap: 1.5, minWidth: 0 })}>
      <Icon aria-hidden className={styles.detailIcon} />
      <span className={srOnly}>{label}: </span>
      <span className={sx({ minWidth: 0 })}>{children}</span>
    </span>
  )
}

// A supplier: its name and status, its company name when Shopify's differs, then its contact details and lead time.
function SupplierRow({
  row,
  owner,
  defaultLeadTimeDays
}: {
  row: SupplierRow
  owner: boolean
  defaultLeadTimeDays: number
}) {
  const email = row.contact.contactEmail ?? row.email
  const website = row.contact.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return (
    <Item variant="outline" className={styles.row}>
      <ItemMedia>
        <Avatar>
          <AvatarFallback>{row.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent className={cn(styles.content, sx({ gap: 2 }))}>
        <div>
          <ItemTitle>{row.name}</ItemTitle>
          {row.shopifySupplierName && row.shopifySupplierName !== row.name && (
            <ItemDescription>{row.shopifySupplierName}</ItemDescription>
          )}
        </div>
        <div className={styles.details}>
          {!row.supplierOrgId && row.invitationHash && (
            <Detail icon={row.expired ? TimerOff : Clock} label="Invitation">
              {row.expired ? "Invitation expired" : "Invited"}
            </Detail>
          )}
          {row.contact.contactName && (
            <Detail icon={User} label="Contact">
              {row.contact.contactName}
            </Detail>
          )}
          {email && (
            <Detail icon={Mail} label="Email">
              {email}
            </Detail>
          )}
          {row.contact.phoneNumber && (
            <Detail icon={Phone} label="Phone">
              {row.contact.phoneNumber}
            </Detail>
          )}
          {row.contact.website && (
            <Detail icon={Globe} label="Website">
              <a href={row.contact.website} target="_blank" rel="noreferrer" className={styles.link}>
                {website}
              </a>
            </Detail>
          )}
          <Detail icon={Timer} label="Lead time">
            {leadTime(row.leadTimeDays, defaultLeadTimeDays)}
          </Detail>
        </div>
      </ItemContent>
      <ItemActions className={sx({ flexWrap: "wrap" })}>
        {owner && !row.supplierOrgId && !row.invitationHash && (
          <InviteSupplierByEmail id={row.id} name={row.name} email={row.email} />
        )}
        {owner && !row.supplierOrgId && row.invitationHash && (
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
        <EditSupplier
          id={row.id}
          name={row.name}
          shopifySupplierName={row.shopifySupplierName}
          leadTimeDays={row.leadTimeDays}
          defaultLeadTimeDays={defaultLeadTimeDays}
          contact={row.contact}
          joined={row.supplierOrgId !== null}
        />
      </ItemActions>
    </Item>
  )
}

export default async function SuppliersPage() {
  const s = await session()
  requireBuyer(s)
  const rows = await loadSuppliers(s.org.id)
  const defaultLeadTimeDays = restockSettings(s.org).leadTimeDays
  // Joined suppliers apart from the rest, which you still share POs with yourself.
  const groups = [
    { title: "Joined", rows: rows.filter((row) => row.supplierOrgId) },
    { title: "Not joined yet", rows: rows.filter((row) => !row.supplierOrgId) }
  ]

  return (
    <>
      <PageHeader title="Suppliers" />
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
            <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
              {groups.map(
                (group) =>
                  group.rows.length > 0 && (
                    <section key={group.title} className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
                      <h3 className={sx({ text: "sm", fontWeight: "medium", color: "muted" })}>
                        {group.title} ({group.rows.length})
                      </h3>
                      <ItemGroup className={sx({ gap: 2 })}>
                        {group.rows.map((row) => (
                          <SupplierRow
                            key={row.id}
                            row={row}
                            owner={s.role === "owner"}
                            defaultLeadTimeDays={defaultLeadTimeDays}
                          />
                        ))}
                      </ItemGroup>
                    </section>
                  )
              )}
            </div>
          ) : (
            <EmptyState title="No suppliers yet" description="Suppliers from Shopify show up here." />
          )}
        </CardContent>
      </Card>
    </>
  )
}
