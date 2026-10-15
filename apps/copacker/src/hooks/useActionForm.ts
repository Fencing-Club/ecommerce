"use client"

import { useRouter } from "next/navigation"
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
        router.push(result.redirect)
      }
      await onSuccess?.(result)
      router.refresh()
    }
  })
}
