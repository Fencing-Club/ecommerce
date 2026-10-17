import { z } from "zod"
export class AnalyticsProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}
export const analyticsPagination = {
  page: z.coerce.number().int().min(0).max(10000).default(0),
  snapshot: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
}
