"use client"

import { AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { type FieldValues, FormProvider, type UseFormReturn } from "react-hook-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, useActionMutation } from "@/lib/api"

export function FormError({ message }: { message?: string }) {
  if (!message) {
    return null
  }
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription className="whitespace-pre-line">{message}</AlertDescription>
    </Alert>
  )
}

export function SubmitButton({
  pending,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button {...props} disabled={pending || props.disabled}>
      {pending && <Spinner data-icon="inline-start" />}
      {children}
    </Button>
  )
}

export function ActionButton({
  action,
  data,
  children,
  variant = "default"
}: {
  action: string
  data: Record<string, unknown>
  children: React.ReactNode
  variant?: "default" | "outline" | "destructive"
}) {
  const router = useRouter()
  const [run, { isLoading }] = useActionMutation()
  const [error, setError] = useState("")

  async function click() {
    setError("")
    try {
      const result = await run({ action, data }).unwrap()
      if (result.redirect) {
        router.push(result.redirect)
      }
      router.refresh()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SubmitButton variant={variant} pending={isLoading} onClick={click}>
        {children}
      </SubmitButton>
      <FormError message={error} />
    </div>
  )
}

// Lays out a form built with useActionForm: its fields, the server error, and the submit button.
export function ActionForm<Values extends FieldValues>({
  form,
  onSubmit,
  label,
  children
}: {
  form: UseFormReturn<Values, unknown, FieldValues>
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>
  label: string
  children: React.ReactNode
}) {
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          {children}
          <FormError message={form.formState.errors.root?.server?.message} />
          <div>
            <SubmitButton type="submit" pending={form.formState.isSubmitting}>
              {label}
            </SubmitButton>
          </div>
        </FieldGroup>
      </form>
    </FormProvider>
  )
}
