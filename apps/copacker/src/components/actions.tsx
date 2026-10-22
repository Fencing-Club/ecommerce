import { Toast } from "@base-ui/react/toast"
import { SubmitButton } from "@/components/form-feedback"
import { useAction } from "@/hooks/use-action"
import type { ActionName } from "@/server/actions"

// A page's one-click action, beside its title. It spins until the page shows the result, and a failure shows as a
// toast, so the header keeps its layout.
export function ActionButton({
  action,
  data,
  children,
  variant = "default"
}: {
  action: ActionName
  data: Record<string, unknown>
  children: React.ReactNode
  variant?: "default" | "outline" | "destructive"
}) {
  const toast = Toast.useToastManager()
  const { run, pending } = useAction(action, { onError: (message) => toast.add({ title: message, type: "error" }) })
  return (
    <SubmitButton variant={variant} pending={pending} onClick={() => void run(data)}>
      {children}
    </SubmitButton>
  )
}
