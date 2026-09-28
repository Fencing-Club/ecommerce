"use client"

import Link from "next/link"
import { FormProvider, useWatch } from "react-hook-form"
import { FormError, SubmitButton } from "@/components/actions"
import { FormInput } from "@/components/form-controls"
import { FieldGroup } from "@/components/ui/field"
import { useActionForm } from "@/hooks/useActionForm"
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
  const { form, submit } = useActionForm({
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
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            readOnly={locked}
            placeholder="you@company.com"
          />
          <PasswordField
            name="password"
            label="Password"
            autoComplete="current-password"
            action={
              <Link
                href={reset}
                className="text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Forgot password?
              </Link>
            }
          />
        </FieldGroup>
        <FormError message={form.formState.errors.root?.server?.message} />
        <SubmitButton type="submit" className="h-10 w-full" pending={leaving(form.formState)}>
          Sign in
        </SubmitButton>
      </form>
    </FormProvider>
  )
}
