import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMessageText } from "@/hooks/use-error-text"
import { sx } from "@/styles/sprinkles.css"

// A form's error, such as the server's. A message that is a full key shows in the person's language.
export function FormError({ message }: { message?: string }) {
  const text = useMessageText()
  if (!message) {
    return null
  }
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription className={sx({ whiteSpace: "pre-line" })}>{text(message)}</AlertDescription>
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
