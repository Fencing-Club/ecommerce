import { useRouter } from "@tanstack/react-router"
import type { FieldValues } from "react-hook-form"
import type { z } from "zod"
import { useSubmissionForm, type SubmissionOptions } from "@/hooks/use-submission-form"
import { useActionMutation } from "@/lib/api"

type Options<Schema extends z.ZodType<FieldValues, FieldValues>> = Omit<SubmissionOptions<Schema>, "run"> & {
  action: string
}

export function useActionForm<Schema extends z.ZodType<FieldValues, FieldValues>>({
  action,
  onSuccess,
  ...options
}: Options<Schema>) {
  const router = useRouter()
  const [run] = useActionMutation()
  return useSubmissionForm({
    ...options,
    run: (data) => run({ action, data }).unwrap(),
    onSuccess: async (result) => {
      if (result.redirect) {
        await router.navigate({ href: result.redirect })
      }
      // Keep the form pending until the saved data is visible, before closing a dialog or starting another action.
      await router.invalidate({ sync: true })
      await onSuccess?.(result)
    }
  })
}
