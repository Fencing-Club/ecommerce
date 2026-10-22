import { useTranslations } from "use-intl"
import { ActionForm } from "@/components/action-form"
import { FormInput } from "@/components/form-controls"
import { useActionForm } from "@/hooks/use-action-form"
import { signUpSchema } from "@/lib/sign-in"
import { PasswordField } from "./password-field"

// A new account: an email and a password. A code sent to the email confirms it next; everything else about the person
// and their company comes after, in getting started. `invitation`, a WorkOS invitation's token, is accepted with it.
export function SignUpForm({
  next,
  email = "",
  locked = false,
  invitation
}: {
  next: string
  email?: string
  locked?: boolean
  invitation?: string
}) {
  const t = useTranslations("auth")
  const { form, submit } = useActionForm({
    schema: signUpSchema,
    action: "auth.signUp",
    navigation: "document",
    defaultValues: { email, password: "" },
    toPayload: (values) => ({ ...values, next, ...(invitation ? { invitation } : {}) })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={t("signup.submit")} layout="auth">
      <FormInput
        name="email"
        label={t("fields.workEmail")}
        type="email"
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        readOnly={locked}
        placeholder={t("fields.emailPlaceholder")}
      />
      <PasswordField name="password" label={t("fields.password")} autoComplete="new-password" isNew />
    </ActionForm>
  )
}
