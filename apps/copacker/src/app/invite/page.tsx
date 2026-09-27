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
  const next = `/invite?token=${encodeURIComponent(token)}&kind=${isTeam ? "team" : "invite"}`
  const user = await identity(next)
  const supplierMembership = await db()
    .select()
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.role, "owner"), eq(organizations.kind, "supplier")))

  return (
    <main id="main-content" className={cn(centeredPage, mutedBackground)}>
      <Card className={sx({ width: "full", maxWidth: "md" })}>
        <CardHeader>
          <div className={brandTile}>
            <Box className={sx({ size: 5 })} />
          </div>
          <CardTitle className={sx({ text: "xl" })}>You’re invited to Copacker</CardTitle>
          <CardDescription>
            Sign in with the email that received this invitation.{" "}
            {isTeam
              ? "Join your company’s shared workspace."
              : "Create or select your supplier workspace to receive the buyer’s purchase orders."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isTeam && !supplierMembership.length && <WorkspaceForm next={next} />}
          {isTeam && (
            <ActionButton action="team.accept" data={{ token }}>
              Accept invitation
            </ActionButton>
          )}
          {!isTeam && supplierMembership.length > 0 && (
            <AcceptSupplierInvitation
              token={token}
              workspaces={supplierMembership.map(({ organizations: org }) => ({ id: org.id, name: org.name }))}
            />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
