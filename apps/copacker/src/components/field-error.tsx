import { FieldError as KitFieldError } from "@buildkitgg/shadcn-baseui-kit"
import { useMessageText } from "@/hooks/use-error-text"

// The kit's FieldError in the person's language: a message that is a full key, as zod schemas write them, is translated,
// in `errors` and as text children.
export function FieldError({ children, errors, ...props }: React.ComponentProps<typeof KitFieldError>) {
  const text = useMessageText()
  return (
    <KitFieldError
      errors={errors?.map((error) => (error?.message ? { ...error, message: text(error.message) } : error))}
      {...props}
    >
      {typeof children === "string" ? text(children) : children}
    </KitFieldError>
  )
}
