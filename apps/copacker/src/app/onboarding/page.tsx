import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { SignedInAs } from "@/components/onboarding/signed-in-as"
export default function Onboarding({ page }: { page: Omit<React.ComponentProps<typeof OnboardingWizard>, "account"> }) {
  return <OnboardingWizard {...page} account={<SignedInAs email={page.accountEmail ?? ""} />} />
}
