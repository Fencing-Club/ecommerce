import { redirect } from "@tanstack/react-router"
import { getCookie } from "@tanstack/react-start/server"
import { eq } from "drizzle-orm"
import type * as React from "react"
import type { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import type { WizardValues } from "@/components/onboarding/onboarding-wizard"
import { db } from "@/db"
import { memberships, organizations } from "@/db/schema"
import { blankPlace } from "@/lib/onboarding"
import { identity } from "@/server/auth"
import { findInvitation, invitationKind, invitationPath } from "@/server/invitations"
import { ownProfile } from "@/server/profile"
import { returnPath } from "@/server/security"
import { workspaceCookie } from "@/server/workspace-session"

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.

// Getting started asks only what's missing. Someone new says who they are, what their company does, the company and
// its first address. An invitation from a buyer settles what the company does and brings the buyer's details for it;
// one from a colleague needs only who they are. Someone already in a workspace without a full profile gives just that.
export async function readOnboardingData(query: {
  next?: string
  invite?: string
  kind?: string
}): Promise<Omit<React.ComponentProps<typeof OnboardingWizard>, "account">> {
  const user = await identity()

  const next = returnPath(query.next, "/")
  const [workspaces, { profile, complete }] = await Promise.all([
    db()
      .select({ id: organizations.id, name: organizations.name })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, user.id)),
    ownProfile(user.id)
  ])
  const person = {
    firstName: profile?.firstName || user.firstName || "",
    lastName: profile?.lastName || user.lastName || "",
    position: profile?.position ?? ""
  }
  const blank: WizardValues = { person, kind: "", company: { name: "", website: "", phone: "" }, address: blankPlace }

  const about = complete ? [] : (["about"] as const)

  if (query.invite) {
    const kind = invitationKind(query.kind)
    const invitation = await findInvitation(kind, query.invite)
    // The invitation's own page explains a link that can't be used, and accepts for someone with nothing to add.
    if (!invitation || invitation.expired || invitation.email !== user.email.toLowerCase()) {
      throw redirect({ href: invitationPath(kind, query.invite) })
    }
    if (kind === "team") {
      if (complete) {
        throw redirect({ href: invitationPath(kind, query.invite) })
      }
      return {
        steps: ["about"],
        finish: { type: "join", token: query.invite, workspace: invitation.company },
        kind: null,
        initial: blank,
        invitedBy: invitation.from,
        accountEmail: user.email
      }
    }
    return {
      steps: [...about, "company", "address"],
      finish: { type: "workspace", invitation: { kind, token: query.invite } },
      kind: kind,
      initial: {
        ...blank,
        kind,
        company: { name: invitation.company, website: invitation.website, phone: invitation.phone },
        address: invitation.addresses[0] ?? blankPlace
      },
      invitedBy: invitation.from,
      accountEmail: user.email
    }
  }

  if (!workspaces.length) {
    return {
      steps: [...about, "role", "company", "address"],
      finish: { type: "workspace", invitation: null },
      kind: null,
      initial: blank,
      invitedBy: null,
      accountEmail: user.email
    }
  }

  if (!complete) {
    // Their company is the workspace they have open.
    const open = getCookie(workspaceCookie)
    const company = profile?.company || (workspaces.find((row) => row.id === open) ?? workspaces[0]!).name
    return {
      steps: ["about"],
      finish: { type: "profile", company, next },
      kind: null,
      initial: blank,
      invitedBy: null,
      accountEmail: user.email
    }
  }
  throw redirect({ href: next })
}
