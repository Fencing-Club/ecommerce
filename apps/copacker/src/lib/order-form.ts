import { destinationSchema, orderInputSchema } from "@repo/copacker-shipments"
import type { z } from "zod"

// The purchase order editor's form. It asks where the PO goes before its lines, so it holds the destination too, and
// each line's receiver follows it (see receiverFor). The PO itself doesn't store it: its lines' receivers say where it
// goes.
export const orderFormSchema = orderInputSchema.safeExtend({ destination: destinationSchema })
export type OrderForm = z.input<typeof orderFormSchema>
