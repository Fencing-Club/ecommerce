import { Button } from "@buildkitgg/shadcn"
import { useTranslations } from "use-intl"
import { AuthPage } from "./auth-shell"

export function CliConsent({ email, intent, state }: { email: string; intent: string; state: string }) {
  const t = useTranslations("auth.cli")
  return (
    <AuthPage title={t("title")} description={t("description")}>
      <p className="text-sm break-all">{t("account", { email })}</p>
      <p className="text-sm text-muted-foreground">{t("permissions")}</p>
      <form method="post" action="/api/cli/consent" className="flex flex-col gap-3">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="state" value={state} />
        <Button type="submit" name="decision" value="allow">
          {t("allow")}
        </Button>
        <Button type="submit" name="decision" value="deny" variant="outline">
          {t("deny")}
        </Button>
      </form>
    </AuthPage>
  )
}
