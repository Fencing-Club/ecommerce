"use client"

import type { FieldValues } from "react-hook-form"
import type { z } from "zod"
import { useSubmissionForm, type SubmissionOptions } from "@/hooks/use-submission-form"
import { useActionMutation } from "@/lib/api"
import { finishSignIn } from "@/lib/auth-navigation"

type Options<Schema extends z.ZodType<FieldValues, FieldValues>> = Omit<SubmissionOptions<Schema>, "run"> & {
  action: string
}

export function useAuthForm<Schema extends z.ZodType<FieldValues, FieldValues>>({
  action,
  onSuccess,
  ...options
}: Options<Schema>) {
  const [run] = useActionMutation()
  return useSubmissionForm({
    ...options,
    run: (data) => run({ action, data }).unwrap(),
    onSuccess: async (result) => {
      await onSuccess?.(result)
      if (result.redirect) {
        finishSignIn(result.redirect)
      }
    }
  })
}
