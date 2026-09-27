"use client"

import { AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { type FieldValues, FormProvider, type UseFormReturn } from "react-hook-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogFooter } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, useActionMutation } from "@/lib/api"
import { sx } from "@/styles/sprinkles.css"

export function FormError({ message }: { message?: string }) {
  if (!message) {
    return null
  }
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription className={sx({ whiteSpace: "pre-line" })}>{message}</AlertDescription>
    </Alert>
  )
}

export function SubmitButton({
  pending,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button {...props} disabled={pending || props.disabled} aria-busy={pending}>
      {pending && <Spinner data-icon="inline-start" />}
      {children}
    </Button>
  )
}

export function ActionButton({
  action,
  data,
  children,
  variant = "default",
  size = "default",
  successMessage
}: {
  action: string
  data: Record<string, unknown>
  children: React.ReactNode
  variant?: "default" | "outline" | "destructive"
  size?: "default" | "sm"
  // Shown after the action succeeds, for actions whose result isn't otherwise visible (such as sending an email).
  successMessage?: string
}) {
  const router = useRouter()
  const [run, { isLoading }] = useActionMutation()
  const [error, setError] = useState("")
  const [succeeded, setSucceeded] = useState(false)

  async function click() {
    setError("")
    setSucceeded(false)
    try {
      const result = await run({ action, data }).unwrap()
      if (result.redirect) {
        router.push(result.redirect)
      }
      setSucceeded(true)
      router.refresh()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
      <SubmitButton variant={variant} size={size} pending={isLoading} onClick={click}>
        {children}
      </SubmitButton>
      {succeeded && successMessage && <output className={sx({ text: "xs", color: "muted" })}>{successMessage}</output>}
      <FormError message={error} />
    </div>
  )
}

// Lays out a form built with useActionForm: its fields, the server error, and the submit button. In a dialog, the
// buttons sit in the dialog's footer with Cancel.
export function ActionForm<Values extends FieldValues>({
  form,
  onSubmit,
  label,
  dialog = false,
  children
}: {
  form: UseFormReturn<Values, unknown, FieldValues>
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>
  label: string
  dialog?: boolean
  children: React.ReactNode
}) {
  const submit = (
    <SubmitButton type="submit" pending={form.formState.isSubmitting} disabled={!dialog && !form.formState.isDirty}>
      {label}
    </SubmitButton>
  )
  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        noValidate
        className={dialog ? sx({ display: "flex", flexDirection: "column", gap: 4 }) : undefined}
      >
        <FieldGroup>
          {children}
          <FormError message={form.formState.errors.root?.server?.message} />
          {!dialog && <div>{submit}</div>}
        </FieldGroup>
        {dialog && (
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            {submit}
          </DialogFooter>
        )}
      </form>
    </FormProvider>
  )
}
