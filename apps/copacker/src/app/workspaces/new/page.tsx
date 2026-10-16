import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { Button } from "@/components/ui/button"
export default function NewWorkspace({
  page
}: {
  page: Omit<React.ComponentProps<typeof OnboardingWizard>, "account">
}) {
  const t = useTranslations("onboarding.wizard")
  return (
    <OnboardingWizard
      {...page}
      account={
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
          {t("cancel")}
        </Button>
      }
    />
  )
}
