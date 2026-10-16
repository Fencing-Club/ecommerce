import { randomUUID } from "node:crypto"
import { db } from "@/db"
import { contacts, memberships, organizations, supplierProfiles } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { contactKindsFor } from "@/lib/contacts"
import { joinSchema, workspaceSetupSchema } from "@/lib/onboarding"
import { setWorkspace } from "./auth"
import { acceptForwarderInvitation } from "./forwarders"
import type { InvitationKind } from "./invitations"
import { acceptSupplierInvitation, acceptTeamInvitation, findInvitation } from "./invitations"
import { writeProfile } from "./profile"
import { workos } from "./workos"

type Person = { id: string; email: string; emailVerified: boolean }

// An invitation that can't be accepted is turned down before anything is created.
async function openInvitation(user: Person, kind: InvitationKind, token: string) {
  if (!user.emailVerified) {
    throw new LocalizedError("verifyEmailFirst")
  }
  const invitation = await findInvitation(kind, token)
  if (!invitation || invitation.expired || invitation.email !== user.email.toLowerCase()) {
    throw new LocalizedError("invitationInvalid")
  }
  return invitation
}

// WorkOS keeps the person's name as well, for its dashboard and emails. Getting started doesn't fail over it.
async function nameAccount(userId: string, person: { firstName: string; lastName: string }) {
  try {
    await workos().userManagement.updateUser({ userId, firstName: person.firstName, lastName: person.lastName })
  } catch (error) {
    console.error("Couldn’t save the person’s name in WorkOS", error)
  }
}

// Creates the person's workspace with its details and first address, saves their profile, and accepts the buyer's
// invitation that brought them, all at once. The new workspace opens next.
export async function setUpWorkspace(user: Person, raw: unknown) {
  const input = workspaceSetupSchema.parse(raw)
  const { invitation, person, company, address } = input
  if (invitation) {
    await openInvitation(user, invitation.kind, invitation.token)
  }
  const kind = invitation?.kind ?? input.kind
  const id = randomUUID()
  const client = workos()
  const remote = await client.organizations.createOrganization({ name: company.name })
  await client.userManagement.createOrganizationMembership({ userId: user.id, organizationId: remote.id })
  await db().transaction(async (tx) => {
    await tx.insert(organizations).values({ id, name: company.name, kind, workosId: remote.id })
    await tx.insert(memberships).values({ orgId: id, userId: user.id, email: user.email, role: "owner" })
    await writeProfile(tx, user.id, { ...person, company: company.name })
    await tx.insert(supplierProfiles).values({
      orgId: id,
      website: company.website || null,
      phoneNumber: company.phone || null,
      // A supplier's buyers see who to contact: the person who set it up, until someone changes it in Settings.
      ...(kind === "supplier" && { contactName: `${person.firstName} ${person.lastName}`, contactEmail: user.email })
    })
    if (address) {
      await tx.insert(contacts).values({
        orgId: id,
        kind: contactKindsFor(kind)[0] ?? "delivery",
        name: address.name,
        address: address.address
      })
    }
    if (invitation?.kind === "supplier") {
      await acceptSupplierInvitation(user, id, invitation.token, tx)
    } else if (invitation?.kind === "forwarder") {
      await acceptForwarderInvitation(user, id, invitation.token, tx)
    }
  })
  await setWorkspace(id)
  await nameAccount(user.id, person)
  return { redirect: "/" }
}

// Accepts an invitation into a workspace that already exists: a colleague joins the one that invited them, or a
// supplier or forwarder links one it owns. A colleague without a profile gives it here, as they join.
export async function joinWorkspace(user: Person, raw: unknown) {
  const input = joinSchema.parse(raw)
  const invitation = await openInvitation(user, input.kind, input.token)
  const orgId = await db().transaction(async (tx) => {
    if (input.kind === "team") {
      const joined = await acceptTeamInvitation(user, input.token, tx)
      if (input.person) {
        await writeProfile(tx, user.id, { ...input.person, company: invitation.company })
      }
      return joined
    }
    if (!input.orgId) {
      throw new LocalizedError("chooseWorkspace")
    }
    if (input.kind === "supplier") {
      await acceptSupplierInvitation(user, input.orgId, input.token, tx)
    } else {
      await acceptForwarderInvitation(user, input.orgId, input.token, tx)
    }
    return input.orgId
  })
  await setWorkspace(orgId)
  if (input.person) {
    await nameAccount(user.id, input.person)
  }
  return { redirect: "/" }
}
