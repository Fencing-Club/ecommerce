import { useRouter } from "@tanstack/react-router"
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
  const [run] = useActionMutation()
  const [isPending, setIsPending] = useState(false)
  const errorMessage = useErrorMessage()
  const [error, setError] = useState("")
  const [succeeded, setSucceeded] = useState(false)

  async function click() {
    setIsPending(true)
    setError("")
    setSucceeded(false)
    try {
      const result = await run({ action, data }).unwrap()
      if (result.redirect) {
        await router.navigate({ href: result.redirect })
      }
      await router.invalidate({ sync: true })
      setSucceeded(true)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
      <SubmitButton variant={variant} size={size} pending={isPending} onClick={click}>
        {children}
      </SubmitButton>
      {succeeded && successMessage && <output className={sx({ text: "xs", color: "muted" })}>{successMessage}</output>}
      <FormError message={error} />
    </div>
  )
}
