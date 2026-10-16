import { zodResolver } from "@hookform/resolvers/zod"
import type { DefaultValues } from "react-hook-form"
import { type FieldValues, useForm } from "react-hook-form"
import type { z } from "zod"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import type { ActionResult } from "@/lib/api"

export type SubmissionOptions<Schema extends z.ZodType<FieldValues, FieldValues>> = {
  schema: Schema
  run: (data: Record<string, unknown>) => Promise<ActionResult>
  defaultValues?: DefaultValues<z.input<Schema>>
  // Shapes validated values into the /api/action payload, for example to add an id or revision.
  toPayload?: (values: z.output<Schema>) => Record<string, unknown>
  onSuccess?: (result: ActionResult) => void
  // A settings form keeps what was saved; other forms clear for the next entry. A settings form whose saving changes
  // what was typed, such as adding a website's https://, passes what to show from the saved values instead.
  keepSaved?: boolean | ((values: z.output<Schema>) => DefaultValues<z.input<Schema>>)
}

export function useSubmissionForm<Schema extends z.ZodType<FieldValues, FieldValues>>({
  schema,
  run,
  defaultValues,
  toPayload,
  onSuccess,
  keepSaved = false
}: SubmissionOptions<Schema>) {
  const formErrorMap = useFormErrorMap()
  const errorMessage = useErrorMessage()
  const form = useForm<z.input<Schema>, unknown, z.output<Schema>>({
    resolver: zodResolver(schema, { error: formErrorMap }),
    defaultValues
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await run(toPayload ? toPayload(values) : values)
      if (!result.redirect && typeof keepSaved === "function") {
        form.reset(keepSaved(values))
      } else if (!result.redirect) {
        form.reset(keepSaved ? form.getValues() : defaultValues)
      }
      await onSuccess?.(result)
    } catch (error) {
      form.setError("root.server", { message: errorMessage(error) })
    }
  })

  return { form, submit }
}
