import { eq } from "drizzle-orm"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { OnboardingWizard, type WizardValues } from "@/components/onboarding/onboarding-wizard"
import { SignedInAs } from "@/components/onboarding/signed-in-as"
import { db } from "@/db"
import { memberships, organizations } from "@/db/schema"
import { blankPlace } from "@/lib/onboarding"
import { identity, workspaceCookie } from "@/server/auth"
import { findInvitation, invitationKind, invitationPath } from "@/server/invitations"
import { ownProfile } from "@/server/profile"
import { returnPath } from "@/server/security"

export const metadata: Metadata = { title: "Get started" }

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"

// Getting started asks only what's missing. Someone new says who they are, what their company does, the company and
// its first address. An invitation from a buyer settles what the company does and brings the buyer's details for it;
// one from a colleague needs only who they are. Someone already in a workspace without a full profile gives just that.
export default async function Onboarding({
  searchParams
}: {
  searchParams: Promise<{ next?: string; invite?: string; kind?: string }>
}) {
  const user = await identity()
  const query = await searchParams
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
  const account = <SignedInAs email={user.email} />
  const about = complete ? [] : (["about"] as const)

  if (query.invite) {
    const kind = invitationKind(query.kind)
    const invitation = await findInvitation(kind, query.invite)
    // The invitation's own page explains a link that can't be used, and accepts for someone with nothing to add.
    if (!invitation || invitation.expired || invitation.email !== user.email.toLowerCase()) {
      redirect(invitationPath(kind, query.invite))
    }
    if (kind === "team") {
      if (complete) {
        redirect(invitationPath(kind, query.invite))
      }
      return (
        <OnboardingWizard
          steps={["about"]}
          finish={{ type: "join", token: query.invite, workspace: invitation.company }}
          kind={null}
          initial={blank}
          invitedBy={invitation.from}
          account={account}
        />
      )
    }
    return (
      <OnboardingWizard
        steps={[...about, "company", "address"]}
        finish={{ type: "workspace", invitation: { kind, token: query.invite } }}
        kind={kind}
        initial={{
          ...blank,
          kind,
          company: { name: invitation.company, website: invitation.website, phone: invitation.phone },
          address: invitation.addresses[0] ?? blankPlace
        }}
        invitedBy={invitation.from}
        account={account}
      />
    )
  }

  if (!workspaces.length) {
    return (
      <OnboardingWizard
        steps={[...about, "role", "company", "address"]}
        finish={{ type: "workspace", invitation: null }}
        kind={null}
        initial={blank}
        invitedBy={null}
        account={account}
      />
    )
  }

  if (!complete) {
    // Their company is the workspace they have open.
    const open = (await cookies()).get(workspaceCookie)?.value
    const company = profile?.company || (workspaces.find((row) => row.id === open) ?? workspaces[0]!).name
    return (
      <OnboardingWizard
        steps={["about"]}
        finish={{ type: "profile", company, next }}
        kind={null}
        initial={blank}
        invitedBy={null}
        account={account}
      />
    )
  }
  redirect(next)
}
