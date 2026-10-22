import { MailCheck } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { ActionForm } from "@/components/action-form"
import { FormInput } from "@/components/form-controls"
import { Button } from "@/components/ui/button"
import { useActionForm } from "@/hooks/use-action-form"
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/sign-in"
import { AuthPage, AuthSwitch } from "./auth-shell"
import { PasswordField } from "./password-field"

// Bold text inside a translated sentence, such as an email address.
function strong(chunks: React.ReactNode) {
  return <span className="font-medium text-foreground">{chunks}</span>
}

// Asks for the email to send a reset link to, then says it's on its way. Whether the email has an account isn't
// revealed.
export function ForgotPassword({ email = "" }: { email?: string }) {
  const t = useTranslations("auth")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { form, submit } = useActionForm({
    schema: forgotPasswordSchema,
    action: "auth.forgotPassword",
    defaultValues: { email },
    keepSaved: true,
    onSuccess: (_, values) => setSentTo(values.email)
  })
  if (sentTo) {
    return (
      <AuthPage
        title={
          <span className="flex flex-col gap-5">
            <span
              aria-hidden
              className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary"
            >
              <MailCheck className="size-6" />
            </span>
            {t("forgotPassword.sentTitle")}
          </span>
        }
        description={t.rich("forgotPassword.sentDescription", {
          email: sentTo,
          strong
        })}
      >
        <Button
          variant="outline"
          className="h-10 w-full"
          nativeButton={false}
          render={<a href="/login" aria-label={t("forgotPassword.backToSignIn")} />}
        >
          {t("forgotPassword.backToSignIn")}
        </Button>
      </AuthPage>
    )
  }
  return (
    <AuthPage title={t("forgotPassword.title")} description={t("forgotPassword.description")}>
      <ActionForm form={form} onSubmit={submit} label={t("forgotPassword.submit")} layout="auth">
        <FormInput
          name="email"
          label={t("fields.email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          placeholder={t("fields.emailPlaceholder")}
        />
      </ActionForm>
      <AuthSwitch prompt={t("forgotPassword.remembered")} href="/login">
        {t("switch.signIn")}
      </AuthSwitch>
    </AuthPage>
  )
}

// The new password, from the emailed link's token. Saving it signs straight in.
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth")
  const { form, submit } = useActionForm({
    schema: resetPasswordSchema,
    action: "auth.resetPassword",
    navigation: "document",
    defaultValues: { password: "" },
    toPayload: (values) => ({ ...values, token })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={t("resetPassword.submit")} layout="auth">
      <PasswordField name="password" label={t("fields.newPassword")} autoComplete="new-password" isNew />
    </ActionForm>
  )
}
