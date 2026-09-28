"use client"

import { FormProvider } from "react-hook-form"
import { FormError, SubmitButton } from "@/components/actions"
import { FormInput } from "@/components/form-controls"
import { FieldGroup } from "@/components/ui/field"
import { useActionForm } from "@/hooks/useActionForm"
import { signUpSchema } from "@/lib/sign-in"
import { cn } from "@/lib/utils"
import { PasswordField } from "./password-field"
import { authFields, leaving } from "./sign-in-form"

// A new account: an email and a password. A code sent to the email confirms it next; everything else about the person
// and their company comes after, in getting started.
export function SignUpForm({ next, email = "", locked = false }: { next: string; email?: string; locked?: boolean }) {
  const { form, submit } = useActionForm({
    schema: signUpSchema,
    action: "auth.signUp",
    defaultValues: { email, password: "" },
    toPayload: (values) => ({ ...values, next })
  })
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className={cn("flex flex-col gap-6", authFields)}>
        <FieldGroup>
          <FormInput
            name="email"
            label="Work email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            readOnly={locked}
            placeholder="you@company.com"
          />
          <PasswordField name="password" label="Password" autoComplete="new-password" isNew />
        </FieldGroup>
        <FormError message={form.formState.errors.root?.server?.message} />
        <SubmitButton type="submit" className="h-10 w-full" pending={leaving(form.formState)}>
          Create account
        </SubmitButton>
      </form>
    </FormProvider>
  )
}
