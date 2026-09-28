import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

// Getting started's corner: who's signed in, and signing out to use another account.
export function SignedInAs({ email }: { email: string }) {
  const t = useTranslations("onboarding.wizard")
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="hidden min-w-0 truncate text-muted-foreground sm:block">{email}</span>
      <form action="/logout" method="post">
        <Button type="submit" variant="ghost" size="sm">
          {t("signOut")}
        </Button>
      </form>
    </div>
  )
}
