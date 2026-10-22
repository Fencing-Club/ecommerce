import { useTranslations } from "use-intl"
import { AuthPage } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"

// A sign-in page that failed, in the sign-in pages' layout. Trying again fetches the page afresh (`retry`; `reset`
// would only re-render what already failed).
export default function AuthError({ retry }: { retry: () => void }) {
  const t = useTranslations("common.pages.error")
  return (
    <AuthPage title={t("didntLoad")}>
      <Button className="h-10 w-full" onClick={retry}>
        {t("tryAgain")}
      </Button>
    </AuthPage>
  )
}
