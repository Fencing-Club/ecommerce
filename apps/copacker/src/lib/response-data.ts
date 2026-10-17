import { z } from "zod"

export const savedRecord = z.object({ id: z.string() })
const failure = z.object({ error: z.string().optional() })

// Only the application's public error field is displayed; malformed error bodies use the local fallback.
export function responseError(value: unknown, fallback: string) {
  const result = failure.safeParse(value)
  return result.success ? (result.data.error ?? fallback) : fallback
}
