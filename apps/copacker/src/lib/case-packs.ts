import { z } from "zod"

// One way a product is packed into a shipping carton: how many sellable units, the carton's outside size and weight.
export const casePackSchema = z.object({
  name: z.string().trim().min(1).max(60),
  units: z.number().int().min(1).max(100000),
  lengthCm: z.number().positive().max(500),
  widthCm: z.number().positive().max(500),
  heightCm: z.number().positive().max(500),
  weightKg: z.number().positive().max(1000).nullable()
})
export type CasePack = z.infer<typeof casePackSchema>
