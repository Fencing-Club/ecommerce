import { AlertCircle } from "lucide-react"
import { useFormState } from "react-hook-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMessageText } from "@/hooks/use-error-text"

// A form's error, such as the server's. A message that is a full key shows in the person's language.
export function FormError({ message }: { message?: string }) {
  const text = useMessageText()
  if (!message) {
    return null
  }
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription className="whitespace-pre-line">{text(message)}</AlertDescription>
    </Alert>
  )
}

// The surrounding React Hook Form's server error, which useActionForm sets on `root.server` when a submission fails.
export function FormServerError() {
  const { errors } = useFormState()
  return <FormError message={errors.root?.server?.message} />
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
