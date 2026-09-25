"use client"

import { AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

export async function perform(action: string, data: Record<string, unknown>) {
  const response = await fetch("/api/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, data })
  })
  const result: { error?: string; redirect?: string; id?: string } = await response.json()
  if (!response.ok) {
    throw new Error(result.error ?? "Could not save. Please try again")
  }
  return result
}

export function FormError({ message }: { message: string }) {
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
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function run() {
    setPending(true)
    setError("")
    try {
      const result = await perform(action, data)
      if (result.redirect) {
        router.push(result.redirect)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SubmitButton variant={variant} pending={pending} onClick={run}>
        {children}
      </SubmitButton>
      <FormError message={error} />
    </div>
  )
}

export function ActionForm({
  action,
  children,
  label,
  transform,
  onSuccess
}: {
  action: string
  children: React.ReactNode
  label: string
  transform?: (data: FormData) => Record<string, unknown>
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setPending(true)
    setError("")
    try {
      const data = new FormData(form)
      const result = await perform(action, transform ? transform(data) : Object.fromEntries(data))
      if (result.redirect) {
        router.push(result.redirect)
      } else {
        form.reset()
      }
      onSuccess?.()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        {children}
        <FormError message={error} />
        <div>
          <SubmitButton type="submit" pending={pending}>
            {label}
          </SubmitButton>
        </div>
      </FieldGroup>
    </form>
  )
}
