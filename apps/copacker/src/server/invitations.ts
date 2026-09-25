import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { memberships, organizations, suppliers } from "@/db/schema"
import { hash } from "./security"

export async function acceptSupplierInvitation(
  user: { id: string; email: string; emailVerified: boolean },
  orgId: string,
  invitation: string
) {
  if (!user.emailVerified) {
    throw new Error("Verify your email before accepting an invitation")
  }
  await db().transaction(async (tx) => {
    const [workspace] = await tx
      .select()
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.orgId, orgId)))
    if (workspace?.memberships.role !== "owner" || workspace.organizations.kind !== "supplier") {
      throw new Error("Choose a supplier workspace that you own")
    }
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(eq(suppliers.invitationHash, hash(invitation)))
      .for("update")
    if (!supplier?.expiresAt || supplier.expiresAt < new Date() || supplier.email !== user.email.toLowerCase()) {
      throw new Error("Invitation expired or belongs to a different email address")
    }
    await tx
      .update(suppliers)
      .set({ supplierOrgId: orgId, invitationHash: null, expiresAt: null })
      .where(eq(suppliers.id, supplier.id))
  })
}
