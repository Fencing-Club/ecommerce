"use client"

import { MailCheck } from "lucide-react"
import { useState } from "react"
import { FormProvider } from "react-hook-form"
import { useTranslations } from "use-intl"
import { FormInput } from "@/components/form-controls"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { useAuthForm } from "@/hooks/use-auth-form"
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/sign-in"
import { cn } from "@/lib/utils"
import { AuthPage, AuthSwitch } from "./auth-shell"
import { PasswordField } from "./password-field"
import { authFields, leaving } from "./sign-in-form"

// Bold text inside a translated sentence, such as an email address.
function strong(chunks: React.ReactNode) {
  return <span className="font-medium text-foreground">{chunks}</span>
}

// Asks for the email to send a reset link to, then says it's on its way. Whether the email has an account isn't
// revealed.
export function ForgotPassword({ email = "" }: { email?: string }) {
  const t = useTranslations("auth")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { form, submit } = useAuthForm({
    schema: forgotPasswordSchema,
    action: "auth.forgotPassword",
    defaultValues: { email },
    keepSaved: true,
    onSuccess: () => setSentTo(form.getValues("email"))
  })
  if (sentTo) {
    return (
      <AuthPage
        title={
          <span className="flex flex-col gap-5">
            <span
              aria-hidden
              className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
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
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className={cn("flex flex-col gap-6", authFields)}>
          <FieldGroup>
            <FormInput
              name="email"
              label={t("fields.email")}
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              placeholder={t("fields.emailPlaceholder")}
            />
          </FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          <SubmitButton type="submit" className="h-10 w-full" pending={form.formState.isSubmitting}>
            {t("forgotPassword.submit")}
          </SubmitButton>
        </form>
      </FormProvider>
      <AuthSwitch prompt={t("forgotPassword.remembered")} href="/login">
        {t("switch.signIn")}
      </AuthSwitch>
    </AuthPage>
  )
}

// The new password, from the emailed link's token. Saving it signs straight in.
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth")
  const { form, submit } = useAuthForm({
    schema: resetPasswordSchema,
    action: "auth.resetPassword",
    defaultValues: { password: "" },
    toPayload: (values) => ({ ...values, token })
  })
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className={cn("flex flex-col gap-6", authFields)}>
        <PasswordField name="password" label={t("fields.newPassword")} autoComplete="new-password" isNew />
        <FormError message={form.formState.errors.root?.server?.message} />
        <SubmitButton type="submit" className="h-10 w-full" pending={leaving(form.formState)}>
          {t("resetPassword.submit")}
        </SubmitButton>
      </form>
    </FormProvider>
  )
}
