import { zodResolver } from "@hookform/resolvers/zod"
import type { DefaultValues, FieldValues } from "react-hook-form"
import { useForm } from "react-hook-form"
import invariant from "tiny-invariant"
import type { z } from "zod"
import { type ActionNavigation, useActionSettle } from "@/hooks/use-action"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import { type ActionResult, useActionMutation } from "@/lib/api"
import type { ActionName } from "@/server/actions"

// A form's Zod schema: what the fields hold, and what they validate to.
export type FormSchema = z.ZodType<FieldValues, FieldValues>

export type ActionFormOptions<S extends FormSchema> = {
  schema: S
  defaultValues?: DefaultValues<z.input<S>>
  // Shapes validated values into the payload, for example to add an id or revision.
  toPayload?: (values: z.output<S>) => Record<string, unknown>
  // Runs once the result shows, with the values that were sent.
  onSuccess?: (result: ActionResult, values: z.output<S>) => void | Promise<void>
  // Runs after a failure's message shows on `root.server`, such as to clear a wrong code for another try.
  onError?: (message: string) => void
  // A settings form keeps what was saved; other forms clear for the next entry. A settings form whose saving changes
  // what was typed, such as adding a website's https://, passes what to show from the saved values instead.
  keepSaved?: boolean | ((values: z.output<S>) => DefaultValues<z.input<S>>)
  // How an action's redirect opens: "document" after signing in, or anything else that changes the session.
  navigation?: ActionNavigation
  // The message for a failure without one of its own.
  fallback?: string
} & (
  | {
      // Posts to /api/action, then opens the redirect or reloads the page's data, as useAction does.
      action: ActionName
      run?: never
    }
  | {
      // Submits some other way, such as a parent's own save, which refreshes what it needs to.
      run: (payload: Record<string, unknown>, values: z.output<S>) => Promise<ActionResult | void>
      action?: never
    }
)

// A React Hook Form + Zod form that submits through an action. A server error shows on `root.server`. After success
// the form resets for the next entry, unless the page changes.
export function useActionForm<S extends FormSchema>({
  schema,
  action,
  run,
  defaultValues,
  toPayload,
  onSuccess,
  onError,
  keepSaved = false,
  navigation,
  fallback
}: ActionFormOptions<S>) {
  const formErrorMap = useFormErrorMap()
  const errorMessage = useErrorMessage()
  const [mutate] = useActionMutation()
  const settle = useActionSettle(navigation)
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema, { error: formErrorMap }),
    defaultValues
  })

  const submit = form.handleSubmit(async (values) => {
    const payload = toPayload ? toPayload(values) : values
    try {
      let result: ActionResult
      if (run) {
        result = (await run(payload, values)) ?? {}
      } else {
        invariant(action, "useActionForm needs an action or run")
        result = await mutate({ action, data: payload }).unwrap()
        // A new document is loading: the form stays submitted until it replaces the page.
        if (!(await settle(result))) {
          return
        }
      }
      await onSuccess?.(result, values)
      // reset() clears isSubmitting too, so it waits until the result shows.
      if (!result.redirect && typeof keepSaved === "function") {
        form.reset(keepSaved(values))
      } else if (!result.redirect) {
        form.reset(keepSaved ? form.getValues() : defaultValues)
      }
    } catch (error) {
      const message = errorMessage(error, fallback)
      form.setError("root.server", { message })
      onError?.(message)
    }
  })

  return { form, submit }
}
