import { Alert, AlertDescription, Button, Spinner } from "@buildkitgg/shadcn"
import { AlertCircle } from "lucide-react"
import { useFormState } from "react-hook-form"
import { useMessageText } from "@/hooks/use-error-text"

// A form's error, such as the server's. A message that is a full key shows in the person's language. `id` lets a field
// name it in aria-describedby, `className` fits it into a surrounding box and `action` is an AlertAction, such as the
// timeline comment box's dismiss button.
export function FormError({
  message,
  id,
  className,
  action
}: {
  message?: string
  id?: string
  className?: string
  action?: React.ReactNode
}) {
  const text = useMessageText()
  if (!message) {
    return null
  }
  return (
    <Alert id={id} variant="destructive" className={className}>
      <AlertCircle aria-hidden />
      <AlertDescription className="whitespace-pre-line">{text(message)}</AlertDescription>
      {action}
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
      {pending && <Spinner aria-hidden data-icon="inline-start" />}
      {children}
    </Button>
  )
}
