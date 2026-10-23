import { defineOperation, readMetadata } from "@repo/copacker-contract"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { suppliers, forwarders } from "@/db/schema"
import { CliError } from "./cli-auth"
import { createForwarder, renameForwarder } from "./forwarders"
import { readPartners } from "./operation-purchasing-reads"
import { createSupplier, updateSupplier, supplierUpdateSchema } from "./suppliers"
import type { Session } from "./workspace-session"

const name = z.string().trim().min(2).max(120)
function metadata(operation: string) {
  return {
    ...readMetadata(operation, ["partners:write"], ["buyer"]),
    effects: [
      {
        kind: "local_write" as const,
        description: "Save a supplier or forwarder relationship without sending invitations."
      }
    ],
    execution: { kind: "mutation" as const, idempotent: true, confirmation: false, readBranches: [] }
  }
}
const result = z.strictObject({ id: z.uuid(), type: z.enum(["supplier", "forwarder"]), name: z.string() })
export const partnerWriteDefinitions = {
  "partners.create": defineOperation(
    metadata("partners.create"),
    z.strictObject({
      data: z.strictObject({ type: z.enum(["supplier", "forwarder"]), name }),
      clientReference: z.uuid()
    }),
    result
  ),
  "partners.update": defineOperation(
    metadata("partners.update"),
    z.discriminatedUnion("type", [
      z.strictObject({
        type: z.literal("supplier"),
        ...supplierUpdateSchema.pick({ id: true, name: true, leadTimeDays: true }).shape,
        expected: z.strictObject({ name: z.string(), leadTimeDays: z.number().nullable() })
      }),
      z.strictObject({
        type: z.literal("forwarder"),
        id: z.uuid(),
        name,
        expected: z.strictObject({ name: z.string() })
      })
    ]),
    result
  )
}
export async function createPartner(
  s: Session,
  input: z.infer<(typeof partnerWriteDefinitions)["partners.create"]["input"]>
) {
  const create = input.data.type === "supplier" ? createSupplier : createForwarder
  const result = await create(s.org, { name: input.data.name, email: null })
  return { id: result.id, type: input.data.type, name: input.data.name }
}
export async function updatePartner(
  s: Session,
  input: z.infer<(typeof partnerWriteDefinitions)["partners.update"]["input"]>
) {
  const table = input.type === "supplier" ? suppliers : forwarders
  const [row] = await db()
    .select({ id: table.id, removedAt: table.removedAt })
    .from(table)
    .where(and(eq(table.id, input.id), eq(table.buyerOrgId, s.org.id)))
    .for("update")
  if (!row || row.removedAt) {
    throw new CliError("not_found", "Partner not found.", 404)
  }
  const current = (await readPartners(s)).find((row) => row.id === input.id && row.type === input.type)
  if (
    !current ||
    current.name !== input.expected.name ||
    (input.type === "supplier" && current.leadTimeDays !== input.expected.leadTimeDays)
  ) {
    throw new CliError("revision_conflict", "Partner changed. Read it again before editing.", 409)
  }
  if (input.type === "supplier") {
    const { type: _, expected: __, ...fields } = input
    // Contact fields are omitted here until the read contract can carry their guarded current values.
    if (Object.keys(fields).some((key) => !["id", "name", "leadTimeDays"].includes(key))) {
      throw new CliError("invalid_input", "Only name and leadTimeDays are editable through this operation.")
    }
    await updateSupplier(s.org.id, fields)
  } else {
    await renameForwarder(s.org.id, input.id, input.name)
  }
  return { id: input.id, type: input.type, name: input.name }
}
