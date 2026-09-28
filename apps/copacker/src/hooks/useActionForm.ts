"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { type DefaultValues, type FieldValues, useForm } from "react-hook-form"
import type { z } from "zod"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import { type ActionResult, useActionMutation } from "@/lib/api"

type Options<Schema extends z.ZodType<FieldValues, FieldValues>> = {
  schema: Schema
  action: string
  defaultValues?: DefaultValues<z.input<Schema>>
  // Shapes validated values into the /api/action payload, for example to add an id or revision.
  toPayload?: (values: z.output<Schema>) => Record<string, unknown>
  onSuccess?: (result: ActionResult) => void
  // A settings form keeps what was saved; other forms clear for the next entry.
  keepSaved?: boolean
}

export function useActionForm<Schema extends z.ZodType<FieldValues, FieldValues>>({
  schema,
  action,
  defaultValues,
  toPayload,
  onSuccess,
  keepSaved = false
}: Options<Schema>) {
  const router = useRouter()
  const [run] = useActionMutation()
  const formErrorMap = useFormErrorMap()
  const errorMessage = useErrorMessage()
  const form = useForm<z.input<Schema>, unknown, z.output<Schema>>({
    resolver: zodResolver(schema, { error: formErrorMap }),
    defaultValues
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await run({ action, data: toPayload ? toPayload(values) : values }).unwrap()
      if (result.redirect) {
        router.push(result.redirect)
      } else {
        form.reset(keepSaved ? form.getValues() : defaultValues)
      }
      onSuccess?.(result)
      router.refresh()
    } catch (error) {
      form.setError("root.server", { message: errorMessage(error) })
    }
  })

  return { form, submit }
}
