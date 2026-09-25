import { and, eq } from "drizzle-orm"
import { Box } from "lucide-react"
import { z } from "zod"
import { ActionButton } from "@/components/actions"
import { AcceptSupplierInvitation, WorkspaceForm } from "@/components/settings-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db"
import { memberships, organizations } from "@/db/schema"
import { identity } from "@/server/auth"

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
    <main id="main-content" className="flex min-h-svh items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Box className="size-5" />
          </div>
          <CardTitle className="text-xl">You’re invited to Copacker</CardTitle>
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
