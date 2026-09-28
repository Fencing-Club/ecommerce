import type { Metadata } from "next"
import Link from "next/link"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { Button } from "@/components/ui/button"
import { blankPlace } from "@/lib/onboarding"
import { session } from "@/server/auth"
import { ownProfile } from "@/server/profile"

export const metadata: Metadata = { title: "New workspace" }

export const dynamic = "force-dynamic"

// Another company, or the same company in another role, such as a buyer that also supplies: getting started's
// company steps, from the workspace menu. The new workspace opens once it's made.
export default async function NewWorkspace() {
  const s = await session()
  const { profile, complete } = await ownProfile(s.user.id)
  return (
    <OnboardingWizard
      steps={complete ? ["role", "company", "address"] : ["about", "role", "company", "address"]}
      finish={{ type: "workspace", invitation: null }}
      kind={null}
      initial={{
        person: {
          firstName: profile?.firstName ?? "",
          lastName: profile?.lastName ?? "",
          position: profile?.position ?? ""
        },
        kind: "",
        company: { name: "", website: "", phone: "" },
        address: blankPlace
      }}
      invitedBy={null}
      account={
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />}>
          Cancel
        </Button>
      }
    />
  )
}
