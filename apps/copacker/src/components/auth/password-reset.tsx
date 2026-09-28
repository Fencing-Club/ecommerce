"use client"

import { MailCheck } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { FormProvider } from "react-hook-form"
import { FormError, SubmitButton } from "@/components/actions"
import { FormInput } from "@/components/form-controls"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { useActionForm } from "@/hooks/useActionForm"
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/sign-in"
import { cn } from "@/lib/utils"
import { AuthPage, AuthSwitch } from "./auth-shell"
import { PasswordField } from "./password-field"
import { authFields, leaving } from "./sign-in-form"

// Asks for the email to send a reset link to, then says it's on its way. Whether the email has an account isn't
// revealed.
export function ForgotPassword({ email = "" }: { email?: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { form, submit } = useActionForm({
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
            Check your email
          </span>
        }
        description={
          <>
            If <span className="font-medium text-foreground">{sentTo}</span> has an account, a reset link is on its way.
          </>
        }
      >
        <Button variant="outline" className="h-10 w-full" nativeButton={false} render={<Link href="/login" />}>
          Back to sign in
        </Button>
      </AuthPage>
    )
  }
  return (
    <AuthPage title="Reset your password" description="We’ll email you a link to choose a new one.">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className={cn("flex flex-col gap-6", authFields)}>
          <FieldGroup>
            <FormInput
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              placeholder="you@company.com"
            />
          </FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          <SubmitButton type="submit" className="h-10 w-full" pending={form.formState.isSubmitting}>
            Send reset link
          </SubmitButton>
        </form>
      </FormProvider>
      <AuthSwitch prompt="Remembered it?" href="/login">
        Sign in
      </AuthSwitch>
    </AuthPage>
  )
}

// The new password, from the emailed link's token. Saving it signs straight in.
export function ResetPasswordForm({ token }: { token: string }) {
  const { form, submit } = useActionForm({
    schema: resetPasswordSchema,
    action: "auth.resetPassword",
    defaultValues: { password: "" },
    toPayload: (values) => ({ ...values, token })
  })
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className={cn("flex flex-col gap-6", authFields)}>
        <PasswordField name="password" label="New password" autoComplete="new-password" isNew />
        <FormError message={form.formState.errors.root?.server?.message} />
        <SubmitButton type="submit" className="h-10 w-full" pending={leaving(form.formState)}>
          Save and sign in
        </SubmitButton>
      </form>
    </FormProvider>
  )
}
