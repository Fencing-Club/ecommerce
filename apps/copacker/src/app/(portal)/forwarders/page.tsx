import type { Address } from "@repo/aisle"
import { CheckCircle2, Clock, MapPin, TimerOff } from "lucide-react"
import type { Metadata } from "next"
import { ActionButton } from "@/components/actions"
import { EmptyState, PageHeader } from "@/components/common"
import {
  AddForwarder,
  ForwarderAddress,
  InviteForwarder,
  RemoveForwarder,
  RenameForwarder
} from "@/components/forwarder-actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireBuyer, session } from "@/server/auth"
import { listForwarders } from "@/server/forwarders"
import { sx } from "@/styles/sprinkles.css"

export const metadata: Metadata = { title: "Forwarders" }

// "1 Test Street, Testville, WA 98000, US"
function addressLine(address: Address) {
  return [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.stateOrRegion,
    address.postalCode,
    address.countryCode
  ]
    .filter(Boolean)
    .join(", ")
}

export default async function ForwardersPage() {
  const s = await session()
  requireBuyer(s)
  const owner = s.role === "owner"
  const rows = await listForwarders(s.org.id)

  return (
    <>
      <PageHeader title="Forwarders">{owner && <AddForwarder />}</PageHeader>
      {rows.length ? (
        <div className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
          {rows.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle>{row.name}</CardTitle>
                <CardDescription className={sx({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 })}>
                  {row.forwarderOrgId && (
                    <Badge variant="outline">
                      <CheckCircle2 data-icon="inline-start" />
                      Joined, keeps its own addresses
                    </Badge>
                  )}
                  {!row.forwarderOrgId && row.invitationHash && (
                    <Badge variant="outline">
                      {row.expired ? <TimerOff data-icon="inline-start" /> : <Clock data-icon="inline-start" />}
                      {row.expired ? "Invitation expired" : `Invited${row.email ? `, ${row.email}` : ""}`}
                    </Badge>
                  )}
                </CardDescription>
                {owner && (
                  <CardAction className={sx({ display: "flex", flexWrap: "wrap", gap: 2 })}>
                    {!row.forwarderOrgId && !row.invitationHash && (
                      <InviteForwarder id={row.id} name={row.name} email={row.email} />
                    )}
                    {!row.forwarderOrgId && row.invitationHash && (
                      <ActionButton
                        action="forwarder.invite"
                        data={{ id: row.id }}
                        variant="outline"
                        size="sm"
                        successMessage={`Invitation sent to ${row.email}`}
                      >
                        Resend invitation
                      </ActionButton>
                    )}
                    <RenameForwarder id={row.id} name={row.name} />
                    <RemoveForwarder id={row.id} name={row.name} />
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 3 })}>
                {row.addresses.length ? (
                  <ul className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
                    {row.addresses.map((contact) => (
                      <li key={contact.id} className={sx({ display: "flex", alignItems: "flex-start", gap: 3 })}>
                        <MapPin className={sx({ size: 4, flexShrink: 0, color: "muted", marginTop: 0.5 })} />
                        <div className={sx({ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 })}>
                          <span className={sx({ text: "sm", fontWeight: "medium" })}>{contact.name}</span>
                          <span className={sx({ text: "sm", color: "muted" })}>{addressLine(contact.address)}</span>
                          <span className={sx({ text: "xs", color: "muted" })}>
                            {[contact.address.name, contact.address.phoneNumber].filter(Boolean).join(", ")}
                          </span>
                        </div>
                        {owner && !row.forwarderOrgId && (
                          <ForwarderAddress forwarderId={row.id} forwarderName={row.name} contact={contact} />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={sx({ text: "sm", color: "muted" })}>
                    {row.forwarderOrgId ? "They haven’t added an address yet." : "No addresses yet."}
                  </p>
                )}
                {owner && !row.forwarderOrgId && (
                  <div>
                    <ForwarderAddress forwarderId={row.id} forwarderName={row.name} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No forwarders yet" description="Add a freight forwarder to ship POs to its warehouse." />
      )}
    </>
  )
}
