"use client"

import { FormProvider } from "react-hook-form"
import { useTranslations } from "use-intl"
import { FormError, SubmitButton } from "@/components/actions"
import { FormInput } from "@/components/form-controls"
import { FieldGroup } from "@/components/ui/field"
import { useActionForm } from "@/hooks/useActionForm"
import { signUpSchema } from "@/lib/sign-in"
import { cn } from "@/lib/utils"
import { PasswordField } from "./password-field"
import { authFields, leaving } from "./sign-in-form"

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
    defaultValues: { email, password: "" },
    toPayload: (values) => ({ ...values, next, ...(invitation ? { invitation } : {}) })
  })
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className={cn("flex flex-col gap-6", authFields)}>
        <FieldGroup>
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
        </FieldGroup>
        <FormError message={form.formState.errors.root?.server?.message} />
        <SubmitButton type="submit" className="h-10 w-full" pending={leaving(form.formState)}>
          {t("signup.submit")}
        </SubmitButton>
      </form>
    </FormProvider>
  )
}
