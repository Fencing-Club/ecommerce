import { defineOperation, readMetadata } from "@repo/copacker-contract"
import { z } from "zod"
import { CliError } from "./cli-auth"
import { saveSupplierCounts } from "./supplier-counts"
import type { Session } from "./workspace-session"

const row = z.strictObject({
  variantId: z.uuid(),
  locationId: z.string().min(1),
  quantity: z.number().int().min(-2147483648).max(2147483647),
  expectedRevision: z.number().int().positive(),
  quantityState: z.literal("on_hand").default("on_hand")
})
const input = z.union([
  row.extend({ mode: z.enum(["direct", "preview"]).default("direct") }),
  z.strictObject({ rows: z.array(row).min(1).max(5000), mode: z.enum(["direct", "preview"]).default("direct") })
])
export const inventoryUpdateDefinition = defineOperation(
  {
    ...readMetadata("inventory.update", ["inventory:write"], ["supplier"]),
    effects: [
      { kind: "local_write", description: "Replace supplier on-hand pieces at the explicit supplier location." }
    ],
    execution: { kind: "mutation", idempotent: true, confirmation: false, readBranches: [] }
  },
  input,
  z.strictObject({
    preview: z.boolean(),
    locationId: z.string(),
    items: z.array(
      z.strictObject({ variantId: z.uuid(), before: z.number(), quantity: z.number(), revision: z.number().int() })
    )
  })
)
export async function updateSupplierInventory(s: Session, input: z.infer<typeof inventoryUpdateDefinition.input>) {
  const rows = "rows" in input ? input.rows : [input]
  const locationId = `supplier:${s.org.id}`
  if (rows.some((row) => row.locationId !== locationId)) {
    throw new CliError("invalid_location", "Select this supplier's stock location.", 409)
  }
  const preview = input.mode === "preview"
  const items = await saveSupplierCounts(
    s,
    {
      counts: rows.map((row) => ({ id: row.variantId, onHand: row.quantity, expectedRevision: row.expectedRevision }))
    },
    preview
  )
  return { preview, locationId, items }
}
