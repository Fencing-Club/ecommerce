import { z } from "zod"

// Tasks the recipient must perform. An empty list means no additional labels are requested.
export const packingRequirementsSchema = z
  .object({
    preparation: z.enum(["none", "polybag", "sealedPolybag"]),
    labels: z
      .array(z.enum(["sku", "fnsku", "suffocation", "choking", "countryOfOrigin"]))
      .max(5)
      .refine((labels) => new Set(labels).size === labels.length, "Choose each label only once"),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .or(z.literal("")),
    instructions: z.string().max(4000)
  })
  .refine((value) => !value.labels.includes("countryOfOrigin") || Boolean(value.countryCode), {
    path: ["countryCode"],
    message: "Choose the country of origin"
  })

export type PackingRequirements = z.infer<typeof packingRequirementsSchema>
export type PackingLabel = PackingRequirements["labels"][number]
export type ProductTask = Exclude<PackingRequirements["preparation"], "none"> | PackingLabel

export function packingTasks(requirements: PackingRequirements): ProductTask[] {
  return [...(requirements.preparation === "none" ? [] : [requirements.preparation]), ...requirements.labels]
}
