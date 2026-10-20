import { Toast } from "@base-ui/react/toast"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { SubmitButton } from "@/components/form-feedback"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"

// A page's one-click action, beside its title. What happened shows as a toast, so the header keeps its layout.
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
  const toast = Toast.useToastManager()

  async function click() {
    setIsPending(true)
    try {
      const result = await run({ action, data }).unwrap()
      if (result.redirect) {
        await router.navigate({ href: result.redirect })
      }
      await router.invalidate({ sync: true })
      if (successMessage) {
        toast.add({ title: successMessage })
      }
    } catch (e) {
      toast.add({ title: errorMessage(e), type: "error" })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <SubmitButton variant={variant} size={size} pending={isPending} onClick={click}>
      {children}
    </SubmitButton>
  )
}
