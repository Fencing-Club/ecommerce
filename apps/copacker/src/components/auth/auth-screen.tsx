import { CircleAlert } from "lucide-react"
import { useTranslations } from "use-intl"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { AuthPageData } from "@/lib/auth-pages"
import { AuthPage, AuthSwitch } from "./auth-shell"
import { ForgotPassword, ResetPasswordForm } from "./password-reset"
import { SignInForm } from "./sign-in-form"
import { SignUpForm } from "./sign-up-form"
import { SocialSignIn } from "./social-sign-in"
import { VerifyEmailForm } from "./verify-email-form"

function strong(chunks: React.ReactNode) {
  return <span className="font-medium text-foreground">{chunks}</span>
}

// Shared by the live app, Start routes and stories. Request validation and session redirects happen before rendering.
export function AuthScreen({ page }: { page: AuthPageData }) {
  const t = useTranslations("auth")
  if (page.kind === "login") {
    const onward = page.next === "/" ? "" : `?${new URLSearchParams({ next: page.next })}`
    return (
      <AuthPage title={t("login.heading")}>
        {page.failed && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{t("login.failed")}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-6">
          <SocialSignIn next={page.next} />
          <SignInForm next={page.next} email={page.email} />
        </div>
        <AuthSwitch prompt={t("switch.newToCopacker")} href={`/signup${onward}`}>
          {t("switch.createAccount")}
        </AuthSwitch>
      </AuthPage>
    )
  }
  if (page.kind === "signup") {
    const onward = page.next === "/" ? "" : `?${new URLSearchParams({ next: page.next })}`
    return (
      <AuthPage title={t("signup.title")}>
        <div className="flex flex-col gap-6">
          {!page.invitation && <SocialSignIn next={page.next} />}
          <SignUpForm
            next={page.next}
            email={page.email}
            locked={Boolean(page.invitation)}
            invitation={page.invitation}
          />
        </div>
        <AuthSwitch prompt={t("switch.haveAccount")} href={`/login${onward}`}>
          {t("switch.signIn")}
        </AuthSwitch>
      </AuthPage>
    )
  }
  if (page.kind === "verify-email") {
    return (
      <AuthPage
        title={t("verifyEmail.title")}
        description={t.rich("verifyEmail.description", { email: page.email, strong })}
      >
        <VerifyEmailForm />
        <AuthSwitch prompt={t("verifyEmail.wrongEmail")} href="/signup">
          {t("verifyEmail.startAgain")}
        </AuthSwitch>
      </AuthPage>
    )
  }
  if (page.kind === "forgot-password") {
    return <ForgotPassword email={page.email} />
  }
  if (!page.token) {
    return (
      <AuthPage title={t("resetPassword.incompleteTitle")} description={t("resetPassword.incompleteDescription")}>
        <Button
          className="h-10 w-full"
          nativeButton={false}
          render={<a href="/forgot-password" aria-label={t("resetPassword.sendNewLink")} />}
        >
          {t("resetPassword.sendNewLink")}
        </Button>
      </AuthPage>
    )
  }
  return (
    <AuthPage title={t("resetPassword.title")}>
      <ResetPasswordForm token={page.token} />
    </AuthPage>
  )
}
