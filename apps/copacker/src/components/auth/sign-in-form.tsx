import { FormProvider, useWatch } from "react-hook-form"
import { useTranslations } from "use-intl"
import { FormInput } from "@/components/form-controls"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { FieldGroup } from "@/components/ui/field"
import { useAuthForm } from "@/hooks/use-auth-form"
import { signInSchema } from "@/lib/sign-in"
import { PasswordField } from "./password-field"

// Taller fields than the portal's, for the few forms someone meets before it. An invitation's email is fixed, and
// looks it.
export const authFields =
  "[&_[data-slot=input]]:h-10 [&_[data-slot=input]:read-only]:bg-muted [&_[data-slot=input]:read-only]:text-muted-foreground"

// Submitting, or done and on the way to the next page: the button keeps its spinner until the page changes.
export function leaving(state: { isSubmitting: boolean; isSubmitSuccessful: boolean }) {
  return state.isSubmitting || state.isSubmitSuccessful
}

// Email and password. `email` fills in the address, such as an invitation's; `locked` keeps it to that address.
export function SignInForm({ next, email = "", locked = false }: { next: string; email?: string; locked?: boolean }) {
  const t = useTranslations("auth")
  const { form, submit } = useAuthForm({
    schema: signInSchema,
    action: "auth.signIn",
    defaultValues: { email, password: "" },
    toPayload: (values) => ({ ...values, next })
  })
  const typed = useWatch({ control: form.control, name: "email" })
  const reset = typed ? `/forgot-password?${new URLSearchParams({ email: typed })}` : "/forgot-password"
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className={`flex flex-col gap-6 ${authFields}`}>
        <FieldGroup>
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
                className="text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t("fields.forgotPassword")}
              </a>
            }
          />
        </FieldGroup>
        <FormError message={form.formState.errors.root?.server?.message} />
        <SubmitButton type="submit" className="h-10 w-full" pending={leaving(form.formState)}>
          {t("login.submit")}
        </SubmitButton>
      </form>
    </FormProvider>
  )
}
