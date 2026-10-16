import type * as React from "react"
import type { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { blankPlace } from "@/lib/onboarding"
import { session } from "@/server/auth"
import { ownProfile } from "@/server/profile"

// Another company, or the same company in another role, such as a buyer that also supplies: getting started's
// company steps, from the workspace menu. The new workspace opens once it's made.
export async function readNewWorkspaceData(): Promise<Omit<React.ComponentProps<typeof OnboardingWizard>, "account">> {
  const s = await session()
  const { profile, complete } = await ownProfile(s.user.id)

  return {
    steps: complete ? ["role", "company", "address"] : ["about", "role", "company", "address"],
    finish: { type: "workspace", invitation: null },
    kind: null,
    initial: {
      person: {
        firstName: profile?.firstName ?? "",
        lastName: profile?.lastName ?? "",
        position: profile?.position ?? ""
      },
      kind: "",
      company: { name: "", website: "", phone: "" },
      address: blankPlace
    },
    invitedBy: null
  }
}
