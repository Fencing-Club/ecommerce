import { z } from "zod"

// Preserve opaque URL values and repeated keys; each page validates the fields it consumes.
export const urlQuery = z.record(z.string(), z.union([z.string(), z.array(z.string())]))
