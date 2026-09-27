import { and, eq } from "drizzle-orm"
import { Box } from "lucide-react"
import type { Metadata } from "next"
import { z } from "zod"
import { ActionButton } from "@/components/actions"
import { AcceptSupplierInvitation, WorkspaceForm } from "@/components/settings-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db"
import { memberships, organizations } from "@/db/schema"
import { cn } from "@/lib/utils"
import { identity } from "@/server/auth"
import { brandTile, centeredPage, mutedBackground } from "../shell.css"
import { sx } from "@/styles/sprinkles.css"

export const metadata: Metadata = { title: "Invitation" }

export default async function Invitation({
  searchParams
}: {
  searchParams: Promise<{ token?: string; kind?: string }>
}) {
  const params = await searchParams
  const token = z.string().min(20).parse(params.token)
  const isTeam = params.kind === "team"
  // A freight forwarder joins its own kind of workspace; a supplier, a supplier workspace.
  const forwarder = params.kind === "forwarder"
  let inviteKind = "invite"
  if (isTeam) {
    inviteKind = "team"
  } else if (forwarder) {
    inviteKind = "forwarder"
  }
  const next = `/invite?token=${encodeURIComponent(token)}&kind=${inviteKind}`
  const user = await identity(next)
  const supplierMembership = await db()
    .select()
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.role, "owner"),
        eq(organizations.kind, forwarder ? "forwarder" : "supplier")
      )
    )

  let description = "Create or select your supplier workspace to receive the buyer’s purchase orders."
  if (isTeam) {
    description = "Join your company’s shared workspace."
  } else if (forwarder) {
    description = "Create or select your forwarder workspace to share your warehouse addresses."
  }

  return (
    <main id="main-content" className={cn(centeredPage, mutedBackground)}>
      <Card className={sx({ width: "full", maxWidth: "md" })}>
        <CardHeader>
          <div className={brandTile}>
            <Box className={sx({ size: 5 })} />
          </div>
          <CardTitle className={sx({ text: "xl" })}>You’re invited to Copacker</CardTitle>
          <CardDescription>Sign in with the email that received this invitation. {description}</CardDescription>
        </CardHeader>
        <CardContent>
          {!isTeam && !supplierMembership.length && (
            <WorkspaceForm next={next} kind={forwarder ? "forwarder" : "supplier"} />
          )}
          {isTeam && (
            <ActionButton action="team.accept" data={{ token }}>
              Accept invitation
            </ActionButton>
          )}
          {!isTeam && supplierMembership.length > 0 && (
            <AcceptSupplierInvitation
              forwarder={forwarder}
              token={token}
              workspaces={supplierMembership.map(({ organizations: org }) => ({ id: org.id, name: org.name }))}
            />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
