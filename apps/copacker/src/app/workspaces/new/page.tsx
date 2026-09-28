import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { Button } from "@/components/ui/button"
import { blankPlace } from "@/lib/onboarding"
import { session } from "@/server/auth"
import { ownProfile } from "@/server/profile"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding")
  return { title: t("newWorkspaceTitle") }
}

export const dynamic = "force-dynamic"

// Another company, or the same company in another role, such as a buyer that also supplies: getting started's
// company steps, from the workspace menu. The new workspace opens once it's made.
export default async function NewWorkspace() {
  const s = await session()
  const { profile, complete } = await ownProfile(s.user.id)
  const t = await getTranslations("onboarding.wizard")
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
          {t("cancel")}
        </Button>
      }
    />
  )
}
