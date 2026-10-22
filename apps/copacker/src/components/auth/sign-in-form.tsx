import { useWatch } from "react-hook-form"
import { useTranslations } from "use-intl"
import { ActionForm } from "@/components/action-form"
import { FormInput } from "@/components/form-controls"
import { useActionForm } from "@/hooks/use-action-form"
import { signInSchema } from "@/lib/sign-in"
import { PasswordField } from "./password-field"

// Email and password. `email` fills in the address, such as an invitation's; `locked` keeps it to that address.
export function SignInForm({ next, email = "", locked = false }: { next: string; email?: string; locked?: boolean }) {
  const t = useTranslations("auth")
  const { form, submit } = useActionForm({
    schema: signInSchema,
    action: "auth.signIn",
    navigation: "document",
    defaultValues: { email, password: "" },
    toPayload: (values) => ({ ...values, next })
  })
  const typed = useWatch({ control: form.control, name: "email" })
  const reset = typed ? `/forgot-password?${new URLSearchParams({ email: typed })}` : "/forgot-password"
  return (
    <ActionForm form={form} onSubmit={submit} label={t("login.submit")} layout="auth">
      <FormInput
        name="email"
        label={t("fields.email")}
        type="email"
        autoComplete="username"
        inputMode="email"
        spellCheck={false}
        readOnly={locked}
        placeholder={t("fields.emailPlaceholder")}
      />
      <PasswordField
        name="password"
        label={t("fields.password")}
        autoComplete="current-password"
        action={
          <a
            href={reset}
            className="focus-ring rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("fields.forgotPassword")}
          </a>
        }
      />
    </ActionForm>
  )
}
