"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { sx } from "@/styles/sprinkles.css"

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
  const errorMessage = useErrorMessage()
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
